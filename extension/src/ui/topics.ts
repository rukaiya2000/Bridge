// How topics and flags look in the popup. Labels only: no message text is ever shown.
import { TOPICS, type Topic, type TurnLabels } from "../../../core/src/types";
import { EMOTIONAL } from "../../../core/src/score";

export type TopicGroup = "difficult" | "positive" | "neutral" | "life";

export const TOPIC_INFO: Record<Topic, { label: string; emoji: string }> = {
  loneliness: { label: "Loneliness", emoji: "😞" },
  sadness: { label: "Sadness", emoji: "😢" },
  stress: { label: "Stress", emoji: "😣" },
  anxiety: { label: "Anxiety", emoji: "😰" },
  anger: { label: "Anger", emoji: "😠" },
  self_worth: { label: "Self-worth", emoji: "🙁" },
  hopelessness: { label: "Hopelessness", emoji: "😩" },
  emptiness: { label: "Emptiness", emoji: "😶" },
  rejection: { label: "Rejection", emoji: "💔" },
  guilt_shame: { label: "Guilt / shame", emoji: "😔" },
  overwhelm: { label: "Overwhelm", emoji: "🥵" },
  fear: { label: "Fear", emoji: "😨" },
  grief: { label: "Grief", emoji: "🖤" },
  jealousy: { label: "Jealousy", emoji: "😒" },
  frustration: { label: "Frustration", emoji: "😤" },
  happiness: { label: "Happiness", emoji: "😊" },
  school: { label: "School", emoji: "📚" },
  friends: { label: "Friends", emoji: "👫" },
  family: { label: "Family", emoji: "🏠" },
  romance: { label: "Romance", emoji: "💘" },
  body_image: { label: "Body image", emoji: "👤" },
  boredom: { label: "Boredom", emoji: "🥱" },
  other: { label: "Other", emoji: "💬" },
};

const LIFE: readonly Topic[] = ["school", "friends", "family", "romance", "body_image", "other"];

export function topicGroup(t: Topic): TopicGroup {
  if ((EMOTIONAL as readonly Topic[]).includes(t)) return "difficult";
  if (t === "happiness") return "positive";
  if (LIFE.includes(t)) return "life";
  return "neutral"; // stress, anger, boredom: shown, but they don't raise the level
}

// Feelings before areas of life, each in TOPICS order.
export const byTopicOrder = (a: Topic, b: Topic) =>
  Number(topicGroup(a) === "life") - Number(topicGroup(b) === "life") || TOPICS.indexOf(a) - TOPICS.indexOf(b);

// The relationship signals, in plain words.
export const FLAG_INFO = {
  crisis: "Crisis language",
  dependency: "Relying on the bot",
  isolation: "Pulling away from people",
  botHook: "Bot kept them talking",
} as const satisfies Partial<Record<keyof TurnLabels, string>>;
