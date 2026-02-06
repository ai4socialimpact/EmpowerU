import { RecommendationForm } from '@/components/recommendation-form';

export default function RecommendationsPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Personalized Recommendations</h1>
        <p className="text-muted-foreground mt-2">
          Tell us about your interests and academic profile to get a customized list of colleges.
        </p>
      </header>
      <RecommendationForm />
    </div>
  );
}
