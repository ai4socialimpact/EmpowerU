import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { Resource } from '@/lib/resources';
import type { ImagePlaceholder } from '@/lib/placeholder-images';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from './ui/badge';
import { ArrowRight } from 'lucide-react';

type ResourceCardProps = {
  resource: Resource;
  image?: ImagePlaceholder;
};

export function ResourceCard({ resource, image }: ResourceCardProps) {
  return (
    <Link href={resource.link} target="_blank" rel="noopener noreferrer" className="block h-full">
      <Card className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full">
        <CardHeader className="p-0">
          {image && (
            <div className="aspect-video relative">
              <Image
                src={image.imageUrl}
                alt={image.description}
                fill
                className="object-cover"
                data-ai-hint={image.imageHint}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-grow p-4">
          <Badge variant="secondary" className="mb-2">{resource.category}</Badge>
          <CardTitle className="font-headline text-lg leading-tight mb-2">{resource.title}</CardTitle>
          <p className="text-sm text-muted-foreground line-clamp-3">{resource.description}</p>
        </CardContent>
        <CardFooter className="p-4 pt-0 mt-auto">
            <div className="flex items-center text-primary text-sm font-medium">
                Read More
                <ArrowRight className="ml-2 h-4 w-4" />
            </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
