export type Resource = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageId: string;
  category: 'Applications' | 'Financial Aid' | 'Academics';
};

export type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

export const resources: Resource[] = [
  {
    id: 'res1',
    title: 'Crafting the Perfect College Essay',
    description: 'Learn the key elements of a compelling college application essay that stands out to admission officers.',
    link: 'https://www.princetonreview.com/college-advice/college-essay',
    imageId: 'resource-4',
    category: 'Applications',
  },
  {
    id: 'res2',
    title: 'Navigating the FAFSA',
    description: 'A step-by-step guide to filling out the Free Application for Federal Student Aid (FAFSA) to maximize your financial aid.',
    link: 'https://studentaid.gov/h/apply-for-aid/fafsa',
    imageId: 'resource-2',
    category: 'Financial Aid',
  },
  {
    id: 'res3',
    title: 'Effective Study Habits for College Success',
    description: 'Discover proven study techniques and time management skills to excel in your college courses.',
    link: 'https://lsc.cornell.edu/how-to-study/',
    imageId: 'resource-6',
    category: 'Academics',
  },
  {
    id: 'res6',
    title: 'Preparing for College Interviews',
    description: 'Tips and common questions to help you prepare for and ace your college admission interviews.',
    link: 'https://bigfuture.collegeboard.org/plan-for-college/apply-to-college/application-process/college-interviews-practice-questions-and-strategies',
    imageId: 'resource-1',
    category: 'Applications',
  },
];
