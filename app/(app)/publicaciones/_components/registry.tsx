"use client";

// Registry: id de template → componente React que lo renderiza.

import { PostPresentacion } from "./templates/post-presentacion";
import { PostAreas } from "./templates/post-areas";
import { PostPublicacion } from "./templates/post-publicacion";
import { PostDiaAbogado } from "./templates/post-dia-abogado";
import { StoryPresentacion } from "./templates/story-presentacion";
import { StoryAreas } from "./templates/story-areas";
import { StoryPublicacion } from "./templates/story-publicacion";
import { StoryDiaAbogado } from "./templates/story-dia-abogado";
import { LinkedInCover } from "./templates/linkedin-cover";

type TemplateComponent = (props: {
  values: Record<string, string | number>;
}) => React.ReactElement;

export const TEMPLATE_COMPONENTS: Record<string, TemplateComponent> = {
  // Posts 4:5
  p1: PostPresentacion,
  p2: PostAreas,
  p3: PostPublicacion,
  p4: PostDiaAbogado,
  // Stories 9:16
  s1: StoryPresentacion,
  s2: StoryAreas,
  s3: StoryPublicacion,
  s4: StoryDiaAbogado,
  // Cover
  li: LinkedInCover,
};
