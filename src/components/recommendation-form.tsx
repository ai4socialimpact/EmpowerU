'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, GraduationCap, ArrowRight } from 'lucide-react';
import { generateCollegeList, GenerateCollegeListOutput } from '@/ai/flows/generate-college-list';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import Link from 'next/link';

const formSchema = z.object({
  location: z.string().min(2, { message: 'Please enter a valid location (e.g., "City, State" or "Zip Code").' }),
  interests: z.string().min(10, { message: 'Please describe your interests in at least 10 characters.' }),
  academicProfile: z.string().min(10, { message: 'Please describe your academic profile in at least 10 characters.' }),
  collegePreferences: z.string().optional(),
});

export function RecommendationForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<GenerateCollegeListOutput['colleges']>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      location: '',
      interests: '',
      academicProfile: '',
      collegePreferences: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setRecommendations([]);
    try {
      const result = await generateCollegeList(values);
      setRecommendations(result.colleges);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: 'Could not generate recommendations. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
               <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., San Francisco, CA or 94103"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This helps us find colleges near you.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="interests"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Interests</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., computer science, robotics, creative writing, hiking..."
                        {...field}
                        rows={4}
                      />
                    </FormControl>
                    <FormDescription>
                      List your hobbies, passions, and subjects you enjoy.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="academicProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Profile</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., GPA: 3.8, SAT: 1400, extracurriculars: coding club, debate team..."
                        {...field}
                        rows={4}
                      />
                    </FormControl>
                    <FormDescription>
                      Include your GPA, test scores (if any), and key activities.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="collegePreferences"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>College Preferences (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., trade school, flexible schedule, online options, community college..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Tell us about anything else you're looking for in a school.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate College List
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <div className="flex flex-col">
        {isLoading && recommendations.length === 0 && (
           <Card className="flex-grow flex items-center justify-center">
             <div className="text-center text-muted-foreground p-8">
               <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
               <p>Generating your personalized college list...</p>
             </div>
           </Card>
        )}
        {!isLoading && recommendations.length === 0 && (
           <Card className="flex-grow flex items-center justify-center bg-muted/50 border-dashed">
             <div className="text-center text-muted-foreground p-8">
               <GraduationCap className="mx-auto h-12 w-12 mb-4" />
               <p>Your recommended colleges will appear here.</p>
             </div>
           </Card>
        )}
        {recommendations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-headline font-bold flex items-center gap-2">
              <Sparkles className="text-primary h-6 w-6"/>
              Your Recommended Colleges
            </h2>
            {recommendations.map((college) => (
              <Card key={college.name}>
                 <CardHeader>
                   <CardTitle className="font-headline text-xl">{college.name}</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <p className="text-sm text-muted-foreground">{college.description}</p>
                 </CardContent>
                 <CardFooter>
                  <Button asChild variant="link" className="p-0 h-auto">
                    <Link href={college.website} target="_blank" rel="noopener noreferrer">
                      Visit Website <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                 </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
