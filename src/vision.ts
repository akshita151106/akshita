import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
  ObjectDetector,
  type Category,
} from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const M = "https://storage.googleapis.com/mediapipe-models";

export type Models = {
  gesture: GestureRecognizer;
  face: FaceLandmarker;
  person: ObjectDetector;
};

// Try the GPU delegate first, fall back to CPU.
async function make<T>(create: (d: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}

export async function loadModels(): Promise<Models> {
  const fileset = await FilesetResolver.forVisionTasks(WASM);

  const gesture = await make((delegate) =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${M}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`,
        delegate,
      },
      runningMode: "VIDEO",
      numHands: 2,
    })
  );

  const face = await make((delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${M}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 4,
      outputFaceBlendshapes: true, // eyeLook* blendshapes drive gaze direction
    })
  );

  const person = await make((delegate) =>
    ObjectDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${M}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
        delegate,
      },
      runningMode: "VIDEO",
      scoreThreshold: 0.4,
      maxResults: 10,
      categoryAllowlist: ["person"],
    })
  );

  return { gesture, face, person };
}

export function closeModels(m: Models) {
  Object.values(m).forEach((x) => x.close());
}

export const GESTURES: Record<string, { label: string; emoji: string }> = {
  Thumb_Up: { label: "THUMBS UP", emoji: "👍" },
  Thumb_Down: { label: "THUMBS DOWN", emoji: "👎" },
  Open_Palm: { label: "OPEN PALM", emoji: "✋" },
  Closed_Fist: { label: "FIST", emoji: "✊" },
  Victory: { label: "PEACE", emoji: "✌️" },
  Pointing_Up: { label: "POINTING", emoji: "☝️" },
};

export type Dir = "Center" | "Left" | "Right" | "Up" | "Down";

// Directions are from the user's point of view (matches the mirrored preview).
export function eyeDirection(cats: Category[]): Dir {
  const s = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
  const left = (s("eyeLookOutLeft") + s("eyeLookInRight")) / 2;
  const right = (s("eyeLookOutRight") + s("eyeLookInLeft")) / 2;
  const up = (s("eyeLookUpLeft") + s("eyeLookUpRight")) / 2;
  const down = (s("eyeLookDownLeft") + s("eyeLookDownRight")) / 2;
  const h = right - left;
  const v = up - down;
  if (Math.abs(h) < 0.2 && Math.abs(v) < 0.2) return "Center";
  return Math.abs(h) >= Math.abs(v) ? (h > 0 ? "Right" : "Left") : v > 0 ? "Up" : "Down";
}
