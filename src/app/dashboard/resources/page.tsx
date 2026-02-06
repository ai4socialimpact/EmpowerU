import { ResourceCard } from '@/components/resource-card';
import { resources } from '@/lib/resources';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function ResourcesPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Resource Library</h1>
        <p className="text-muted-foreground mt-2">
          Explore our curated collection of articles, guides, and tools to help you on your journey.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {resources.map((resource) => {
          const image = PlaceHolderImages.find((img) => img.id === resource.imageId);
          return <ResourceCard key={resource.id} resource={resource} image={image} />;
        })}
      </div>
    </div>
  );
}
