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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ThumbsDown, ThumbsUp } from 'lucide-react';

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

type FeedbackFilter = 'all' | 'down' | 'up';

type FeedbackUserGroup = {
  uid: string;
  label: string;
  email?: string | null;
  items: FeedbackIndexItem[];
  latestAt?: string;
  thumbsUpCount: number;
  thumbsDownCount: number;
};

type FeedbackTypeGroup = {
  key: string;
  label: string;
  items: FeedbackIndexItem[];
  latestAt?: string;
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

function getUserLabel(feedback: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
} | null): string {
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
  const [error, setError] = useState<string | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackIndexItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FeedbackFilter>('all');
  const [expandedFeedbackIds, setExpandedFeedbackIds] = useState<string[]>([]);
  const [feedbackDetailsById, setFeedbackDetailsById] = useState<Record<string, FeedbackDetail>>({});
  const [loadingFeedbackIds, setLoadingFeedbackIds] = useState<Record<string, boolean>>({});

  const groupedUsers = useMemo<FeedbackUserGroup[]>(() => {
    const groups = new Map<string, FeedbackUserGroup>();

    feedbackItems.forEach((item) => {
      const existingGroup = groups.get(item.uid);
      if (existingGroup) {
        existingGroup.items.push(item);
        existingGroup.latestAt =
          item.updatedAt && (!existingGroup.latestAt || item.updatedAt > existingGroup.latestAt)
            ? item.updatedAt
            : existingGroup.latestAt;
        if (item.feedback === 'down') {
          existingGroup.thumbsDownCount += 1;
        } else {
          existingGroup.thumbsUpCount += 1;
        }
        return;
      }

      groups.set(item.uid, {
        uid: item.uid,
        label: getUserLabel(item),
        email: item.email ?? null,
        items: [item],
        latestAt: item.updatedAt,
        thumbsUpCount: item.feedback === 'up' ? 1 : 0,
        thumbsDownCount: item.feedback === 'down' ? 1 : 0,
      });
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = a.latestAt ? new Date(a.latestAt).getTime() : 0;
      const bTime = b.latestAt ? new Date(b.latestAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [feedbackItems]);

  const selectedUser = useMemo(
    () => groupedUsers.find((group) => group.uid === selectedUserId) ?? null,
    [groupedUsers, selectedUserId]
  );

  const selectedUserItems = useMemo(() => {
    if (!selectedUser) {
      return [];
    }

    return [...selectedUser.items].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [selectedUser]);

  const tabFilteredItems = useMemo(() => {
    if (activeTab === 'all') {
      return selectedUserItems;
    }

    return selectedUserItems.filter((item) => item.feedback === activeTab);
  }, [activeTab, selectedUserItems]);

  const tabCounts = useMemo(
    () => ({
      all: selectedUserItems.length,
      up: selectedUserItems.filter((item) => item.feedback === 'up').length,
      down: selectedUserItems.filter((item) => item.feedback === 'down').length,
    }),
    [selectedUserItems]
  );

  const groupedByType = useMemo<FeedbackTypeGroup[]>(() => {
    const groups = new Map<string, FeedbackTypeGroup>();

    tabFilteredItems.forEach((item) => {
      const label = item.reasonLabel || item.reasonCode || 'No reason selected';
      const key = item.reasonCode || item.reasonLabel || 'no_reason_selected';
      const existingGroup = groups.get(key);

      if (existingGroup) {
        existingGroup.items.push(item);
        existingGroup.latestAt =
          item.updatedAt && (!existingGroup.latestAt || item.updatedAt > existingGroup.latestAt)
            ? item.updatedAt
            : existingGroup.latestAt;
        return;
      }

      groups.set(key, {
        key,
        label,
        items: [item],
        latestAt: item.updatedAt,
      });
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = a.latestAt ? new Date(a.latestAt).getTime() : 0;
      const bTime = b.latestAt ? new Date(b.latestAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [tabFilteredItems]);

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
    if (groupedUsers.length === 0) {
      setSelectedUserId(null);
      return;
    }

    const stillVisible = groupedUsers.some((group) => group.uid === selectedUserId);
    if (!stillVisible) {
      setSelectedUserId(groupedUsers[0].uid);
    }
  }, [groupedUsers, selectedUserId]);

  useEffect(() => {
    setExpandedFeedbackIds([]);
  }, [selectedUserId, activeTab]);

  async function loadFeedbackDetail(feedbackId: string): Promise<void> {
    if (feedbackDetailsById[feedbackId] || loadingFeedbackIds[feedbackId]) {
      return;
    }

    try {
      setLoadingFeedbackIds((current) => ({ ...current, [feedbackId]: true }));
      const feedbackDoc = await getDoc(doc(firestore, 'chatFeedback', feedbackId));

      if (!feedbackDoc.exists()) {
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

      setFeedbackDetailsById((current) => ({
        ...current,
        [feedbackId]: {
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
        },
      }));
    } catch (e) {
      console.error(e);
      setError('Failed to load feedback details.');
    } finally {
      setLoadingFeedbackIds((current) => ({ ...current, [feedbackId]: false }));
    }
  }

  function toggleExpanded(feedbackId: string): void {
    const isExpanded = expandedFeedbackIds.includes(feedbackId);

    if (isExpanded) {
      setExpandedFeedbackIds((current) => current.filter((id) => id !== feedbackId));
      return;
    }

    setExpandedFeedbackIds((current) => [...current, feedbackId]);
    void loadFeedbackDetail(feedbackId);
  }

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
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[75vh] space-y-2 overflow-y-auto">
              {groupedUsers.length === 0 && (
                <p className="text-sm text-muted-foreground">No feedback found.</p>
              )}

              {groupedUsers.map((group) => (
                <button
                  key={group.uid}
                  type="button"
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    selectedUserId === group.uid
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedUserId(group.uid)}
                >
                  <p className="font-medium">{group.label}</p>
                  <p className="mt-1 text-xs opacity-80">
                    {group.thumbsDownCount} down - {group.thumbsUpCount} up - {group.items.length} total
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    Latest: {formatDateTime(group.latestAt)}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedUser ? `Feedback For ${selectedUser.label}` : 'Select a user'}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[75vh] space-y-5 overflow-y-auto">
              {!selectedUser && (
                <p className="text-sm text-muted-foreground">
                  Choose a user to view their feedback.
                </p>
              )}

              {selectedUser && (
                <>
                  <div className="rounded-lg border bg-muted/20 p-5">
                    <p className="text-lg font-semibold">{selectedUser.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review feedback history, grouped by type, for this user.
                    </p>
                  </div>

                  <div className="grid gap-4 rounded-lg border p-5 md:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Total Feedback</p>
                      <p className="text-lg font-semibold">{selectedUser.items.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Positive</p>
                      <p className="text-lg font-semibold">{selectedUser.thumbsUpCount}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Negative</p>
                      <p className="text-lg font-semibold">{selectedUser.thumbsDownCount}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Latest</p>
                      <p>{formatDateTime(selectedUser.latestAt)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-5">
                    <p className="mb-3 text-sm font-semibold">Feedback View</p>
                    <Tabs
                      value={activeTab}
                      onValueChange={(value) => setActiveTab(value as FeedbackFilter)}
                    >
                      <TabsList className="w-full justify-start">
                        <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                        <TabsTrigger value="up">Positive ({tabCounts.up})</TabsTrigger>
                        <TabsTrigger value="down">Negative ({tabCounts.down})</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-6">
                    {groupedByType.length === 0 && (
                      <div className="rounded-lg border p-5">
                        <p className="text-sm text-muted-foreground">
                          No feedback matches the selected tab.
                        </p>
                      </div>
                    )}

                    {groupedByType.map((typeGroup) => (
                      <div
                        key={typeGroup.key}
                        className="rounded-xl border border-border bg-muted/30 p-6 shadow-md"
                      >
                        <div className="mb-5 border-b border-border/70 pb-5">
                          <p className="text-sm font-semibold">{typeGroup.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeGroup.items.length} item{typeGroup.items.length === 1 ? '' : 's'} - Latest{' '}
                            {formatDateTime(typeGroup.latestAt)}
                          </p>
                        </div>

                        <div className="space-y-3">
                          {typeGroup.items.map((item) => {
                            const detail = feedbackDetailsById[item.id];
                            const isExpanded = expandedFeedbackIds.includes(item.id);
                            const isLoadingDetail = loadingFeedbackIds[item.id];

                            return (
                              <div
                                key={item.id}
                                className={`rounded-lg border-l-4 ${
                                  item.feedback === 'down'
                                    ? 'border-l-destructive border-y border-r'
                                    : 'border-l-emerald-600 border-y border-r'
                                }`}
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                                  onClick={() => toggleExpanded(item.id)}
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm">
                                      {item.feedback === 'down' ? (
                                        <ThumbsDown className="h-4 w-4 text-destructive" />
                                      ) : (
                                        <ThumbsUp className="h-4 w-4 text-emerald-600" />
                                      )}
                                      <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{item.messageTextPreview || 'No preview available'}</p>
                                  </div>
                                  <ChevronDown
                                    className={`mt-1 h-4 w-4 shrink-0 transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                </button>

                                {isExpanded && (
                                  <div className="space-y-5 border-t px-5 py-5">
                                    {isLoadingDetail ? (
                                      <p className="text-sm text-muted-foreground">Loading feedback details...</p>
                                    ) : (
                                      <>
                                        <div className="grid gap-4 rounded-md border p-5 md:grid-cols-2">
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">User</p>
                                            <p>{getUserLabel(detail ?? item)}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Feedback</p>
                                            <p>{item.feedback === 'down' ? 'Thumbs Down' : 'Thumbs Up'}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Reason</p>
                                            <p>{item.reasonLabel || item.reasonCode || 'No reason selected'}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Chat</p>
                                            <p>{item.uid} / {item.chatId}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Created</p>
                                            <p>{formatDateTime(detail?.createdAt ?? item.createdAt)}</p>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <p className="text-sm font-semibold">Feedback Details</p>
                                          <div className="rounded-md border bg-muted/30 p-5">
                                            <p className="whitespace-pre-wrap text-sm">
                                              {detail?.details || 'No additional details submitted.'}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <p className="text-sm font-semibold">AI Response</p>
                                          <div className="rounded-md border p-5">
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                                              {(detail?.messageRole ?? item.messageRole) === 'user'
                                                ? 'User Message'
                                                : 'Model Message'}
                                            </p>
                                            <p className="whitespace-pre-wrap text-sm">
                                              {detail?.messageTextFull ||
                                                detail?.messageTextPreview ||
                                                item.messageTextPreview ||
                                                'No message available.'}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="grid gap-5 md:grid-cols-2">
                                          <div className="space-y-2">
                                            <p className="text-sm font-semibold">Suggested Follow-ups</p>
                                            <div className="rounded-md border p-5">
                                              {detail?.followUpQuestions &&
                                              detail.followUpQuestions.length > 0 ? (
                                                <div className="space-y-2">
                                                  {detail.followUpQuestions.map((question) => (
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

                                          {detail?.relatedResources &&
                                          detail.relatedResources.length > 0 ? (
                                            <div className="space-y-2">
                                              <p className="text-sm font-semibold">Related Resources</p>
                                              <div className="rounded-md border p-5">
                                                <div className="space-y-2">
                                                  {detail.relatedResources.map((resource) => (
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
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
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
