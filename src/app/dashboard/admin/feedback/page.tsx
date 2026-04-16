'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import {
  formatDateShort,
  formatTimeShort,
  toIsoStringIfPossible,
} from '@/lib/chat-message-utils';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type FeedbackIndexItem = {
  id: string;
  uid: string;
  chatId: string;
  messageId: string;
  feedback: 'up' | 'down';
  reasonCode?: string | null;
  reasonLabel?: string | null;
  active?: boolean;
  displayName?: string | null;
  email?: string | null;
  messageRole?: 'user' | 'model';
  messageTextPreview?: string | null;
  conversationIndexId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type RelatedResource = {
  title: string;
  url: string;
};

type FeedbackDetail = FeedbackIndexItem & {
  details?: string | null;
  messageTextFull?: string | null;
  followUpQuestions?: string[];
  relatedResources?: RelatedResource[];
  flowName?: string | null;
  modelName?: string | null;
};

function normalizeFeedbackValue(value: unknown): 'up' | 'down' {
  return value === 'up' ? 'up' : 'down';
}

function formatDateTime(isoString?: string): string {
  const date = formatDateShort(isoString);
  const time = formatTimeShort(isoString);

  if (date === '--' && time === '--') {
    return 'Unknown';
  }

  return `${date === '--' ? '' : date} ${time === '--' ? '' : time}`.trim();
}

function getUserLabel(feedback: FeedbackIndexItem | FeedbackDetail | null): string {
  if (!feedback) {
    return 'Unknown user';
  }

  if (feedback.displayName && feedback.displayName.trim()) {
    return feedback.displayName.trim();
  }

  if (feedback.email && feedback.email.includes('@')) {
    return feedback.email;
  }

  return feedback.uid || 'Unknown user';
}

export default function AdminFeedbackPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackIndexItem[]>([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDetail | null>(null);

  const currentFeedback = useMemo(
    () => feedbackItems.find((item) => item.id === selectedFeedbackId) ?? null,
    [feedbackItems, selectedFeedbackId]
  );

  useEffect(() => {
    async function checkAdminAndLoadFeedback() {
      if (!user) {
        setIsCheckingAdmin(false);
        setIsLoadingFeedback(false);
        return;
      }

      try {
        setError(null);
        const adminDoc = await getDoc(doc(firestore, 'admins', user.uid));
        const admin = adminDoc.exists();
        setIsAdmin(admin);
        setIsCheckingAdmin(false);

        if (!admin) {
          setIsLoadingFeedback(false);
          return;
        }

        const feedbackSnapshot = await getDocs(
          query(collection(firestore, 'feedbackIndex'), orderBy('updatedAt', 'desc'))
        );

        const loadedFeedback = feedbackSnapshot.docs.map((feedbackDoc) => {
          const data = feedbackDoc.data() as {
            uid?: string;
            chatId?: string;
            messageId?: string;
            feedback?: 'up' | 'down';
            reasonCode?: string | null;
            reasonLabel?: string | null;
            active?: boolean;
            displayName?: string | null;
            email?: string | null;
            messageRole?: 'user' | 'model';
            messageTextPreview?: string | null;
            conversationIndexId?: string | null;
            createdAt?: unknown;
            updatedAt?: unknown;
          };

          return {
            id: feedbackDoc.id,
            uid: data.uid ?? '',
            chatId: data.chatId ?? 'default',
            messageId: data.messageId ?? '',
            feedback: normalizeFeedbackValue(data.feedback),
            reasonCode: data.reasonCode ?? null,
            reasonLabel: data.reasonLabel ?? null,
            active: data.active ?? false,
            displayName: data.displayName ?? null,
            email: data.email ?? null,
            messageRole: data.messageRole ?? 'model',
            messageTextPreview: data.messageTextPreview ?? null,
            conversationIndexId: data.conversationIndexId ?? null,
            createdAt: toIsoStringIfPossible(data.createdAt),
            updatedAt: toIsoStringIfPossible(data.updatedAt),
          };
        });

        setFeedbackItems(loadedFeedback);
      } catch (e) {
        console.error(e);
        setError('Failed to load admin feedback.');
      } finally {
        setIsCheckingAdmin(false);
        setIsLoadingFeedback(false);
      }
    }

    checkAdminAndLoadFeedback();
  }, [user, firestore]);

  useEffect(() => {
    if (!selectedFeedbackId && feedbackItems.length > 0) {
      setSelectedFeedbackId(feedbackItems[0].id);
    }
  }, [feedbackItems, selectedFeedbackId]);

  useEffect(() => {
    async function loadSelectedFeedback() {
      if (!selectedFeedbackId || !isAdmin) {
        setSelectedFeedback(null);
        return;
      }

      try {
        setIsLoadingDetail(true);
        const feedbackDoc = await getDoc(doc(firestore, 'chatFeedback', selectedFeedbackId));

        if (!feedbackDoc.exists()) {
          setSelectedFeedback(null);
          return;
        }

        const data = feedbackDoc.data() as {
          uid?: string;
          chatId?: string;
          messageId?: string;
          feedback?: 'up' | 'down';
          reasonCode?: string | null;
          reasonLabel?: string | null;
          active?: boolean;
          displayName?: string | null;
          email?: string | null;
          messageRole?: 'user' | 'model';
          messageTextPreview?: string | null;
          messageTextFull?: string | null;
          details?: string | null;
          followUpQuestions?: string[];
          relatedResources?: RelatedResource[];
          flowName?: string | null;
          modelName?: string | null;
          conversationIndexId?: string | null;
          createdAt?: unknown;
          updatedAt?: unknown;
        };

        setSelectedFeedback({
          id: feedbackDoc.id,
          uid: data.uid ?? '',
          chatId: data.chatId ?? 'default',
          messageId: data.messageId ?? '',
          feedback: normalizeFeedbackValue(data.feedback),
          reasonCode: data.reasonCode ?? null,
          reasonLabel: data.reasonLabel ?? null,
          active: data.active ?? false,
          displayName: data.displayName ?? null,
          email: data.email ?? null,
          messageRole: data.messageRole ?? 'model',
          messageTextPreview: data.messageTextPreview ?? null,
          messageTextFull: data.messageTextFull ?? null,
          details: data.details ?? null,
          followUpQuestions: Array.isArray(data.followUpQuestions)
            ? data.followUpQuestions
            : [],
          relatedResources: Array.isArray(data.relatedResources)
            ? data.relatedResources
            : [],
          flowName: data.flowName ?? null,
          modelName: data.modelName ?? null,
          conversationIndexId: data.conversationIndexId ?? null,
          createdAt: toIsoStringIfPossible(data.createdAt),
          updatedAt: toIsoStringIfPossible(data.updatedAt),
        });
      } catch (e) {
        console.error(e);
        setError('Failed to load selected feedback.');
      } finally {
        setIsLoadingDetail(false);
      }
    }

    loadSelectedFeedback();
  }, [firestore, selectedFeedbackId, isAdmin]);

  if (isUserLoading || isCheckingAdmin) {
    return <div className="p-6">Loading admin access...</div>;
  }

  if (!user) {
    return <div className="p-6">Please sign in to access admin tools.</div>;
  }

  if (!isAdmin) {
    return <div className="p-6">You do not have admin access.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Admin Feedback Viewer</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {isLoadingFeedback ? (
        <p>Loading feedback...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Feedback Queue</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
              {feedbackItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No feedback found.</p>
              )}
              {feedbackItems.map((item) => (
                <Button
                  key={item.id}
                  variant={selectedFeedbackId === item.id ? 'default' : 'outline'}
                  className="h-auto w-full justify-start py-3"
                  onClick={() => setSelectedFeedbackId(item.id)}
                >
                  <div className="text-left">
                    <p className="font-medium">
                      {item.feedback === 'down' ? 'Thumbs Down' : 'Thumbs Up'}
                    </p>
                    <p className="text-xs opacity-80">{getUserLabel(item)}</p>
                    <p className="text-xs opacity-80">
                      {item.reasonLabel || item.reasonCode || 'No reason selected'}
                    </p>
                    <p className="line-clamp-2 text-xs opacity-80">
                      {item.messageTextPreview || 'No preview available'}
                    </p>
                    <p className="text-xs opacity-80">
                      Updated: {formatDateTime(item.updatedAt)}
                    </p>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {currentFeedback
                  ? `${currentFeedback.feedback === 'down' ? 'Negative' : 'Positive'} Feedback`
                  : 'Select feedback'}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-5 overflow-y-auto">
              {!currentFeedback && (
                <p className="text-sm text-muted-foreground">
                  Choose a feedback item to view the full details.
                </p>
              )}

              {currentFeedback && isLoadingDetail && (
                <p className="text-sm text-muted-foreground">Loading feedback details...</p>
              )}

              {currentFeedback && !isLoadingDetail && !selectedFeedback && (
                <p className="text-sm text-muted-foreground">
                  The full feedback record could not be found.
                </p>
              )}

              {selectedFeedback && !isLoadingDetail && (
                <>
                  <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">User</p>
                      <p>{getUserLabel(selectedFeedback)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Feedback</p>
                      <p>{selectedFeedback.feedback === 'down' ? 'Thumbs Down' : 'Thumbs Up'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Reason</p>
                      <p>{selectedFeedback.reasonLabel || selectedFeedback.reasonCode || 'No reason selected'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Chat</p>
                      <p>{selectedFeedback.uid} / {selectedFeedback.chatId}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Created</p>
                      <p>{formatDateTime(selectedFeedback.createdAt)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Feedback Details</p>
                    <div className="rounded-md border bg-muted/30 p-4">
                      <p className="whitespace-pre-wrap text-sm">
                        {selectedFeedback.details || 'No additional details submitted.'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold">AI Response</p>
                    <div className="rounded-md border p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                        {selectedFeedback.messageRole === 'user' ? 'User Message' : 'Model Message'}
                      </p>
                      <p className="whitespace-pre-wrap text-sm">
                        {selectedFeedback.messageTextFull ||
                          selectedFeedback.messageTextPreview ||
                          'No message snapshot available.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Suggested Follow-ups</p>
                      <div className="rounded-md border p-4">
                        {selectedFeedback.followUpQuestions &&
                        selectedFeedback.followUpQuestions.length > 0 ? (
                          <div className="space-y-2">
                            {selectedFeedback.followUpQuestions.map((question) => (
                              <p key={question} className="text-sm">
                                {question}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No follow-up questions</p>
                        )}
                      </div>
                    </div>

                    {selectedFeedback.relatedResources &&
                    selectedFeedback.relatedResources.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Related Resources</p>
                        <div className="rounded-md border p-4">
                          <div className="space-y-2">
                            {selectedFeedback.relatedResources.map((resource) => (
                              <a
                                key={`${resource.title}-${resource.url}`}
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-sm text-primary underline-offset-4 hover:underline"
                              >
                                {resource.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
