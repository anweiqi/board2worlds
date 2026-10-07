export type Mode = "hero" | "fused";

export type PinRole =
  | "scene" // wide view of a space; usable as world input
  | "landmark" // a notable object/feature that should exist in the world
  | "detail" // small props / tabletop details
  | "material" // only contributes textures, palette, fabrics
  | "mood" // atmosphere / lighting / film grain reference
  | "ignore"; // portrait, product shot, etc. not useful for the world

export interface PinAnalysis {
  index: number;
  role: PinRole;
  /** 0-10: how usable this image is as a wide, eye-level scene reference */
  scene_score: number;
  summary: string;
  contributes: string[];
}

export interface SceneSpec {
  world_title: string;
  world_type: string;
  style: string;
  layout: string;
  zones: { name: string; description: string }[];
  materials: string[];
  palette: string[];
  key_objects: string[];
  avoid: string[];
  pins: PinAnalysis[];
  hero_pin_index: number;
  /** Indices of pins to feed the image composer (3-5), hero first */
  reference_pin_indices: number[];
  /** Prompt to send to World Labs alongside the chosen image */
  world_text_prompt: string;
  /** Prompt for the image model to compose a unified scene image */
  compose_prompt: string;
}

export interface WorldAssets {
  caption?: string;
  thumbnail_url?: string;
  splats?: {
    spz_urls?: Record<string, string>;
    semantics_metadata?: {
      metric_scale_factor?: number;
      ground_plane_offset?: number;
    };
  };
  mesh?: {
    collider_mesh_url?: string;
    hq_mesh_url?: string;
    full_res_mesh_url?: string;
  };
  imagery?: { pano_url?: string };
}

export interface WorldResult {
  id: string;
  display_name?: string;
  world_marble_url?: string;
  assets?: WorldAssets;
  permission?: { public?: boolean; allow_id_access?: boolean } | null;
}

export type RunStatus =
  | "analyzed"
  | "composed"
  | "generating"
  | "succeeded"
  | "failed";

export interface Run {
  id: string;
  created_at: string;
  updated_at: string;
  mode: Mode;
  status: RunStatus;
  /** Original image sources: http(s) URLs or /board/xxx.jpg public paths */
  images: string[];
  spec?: SceneSpec;
  /** Public path of composed scene image (fused mode) */
  scene_image?: string;
  /** Path of the image actually sent to World Labs */
  world_input_image?: string;
  world_text_prompt?: string;
  worldlabs?: {
    model: string;
    media_asset_id?: string;
    operation_id?: string;
    progress?: string;
    world_id?: string;
    world?: WorldResult;
    error?: string;
  };
  error?: string;
}
