import type { CoreApi } from "./types.js";
import { rulesLabel } from "./rules.js";
import { labelTurn } from "./labeler.js";
import { emptyProfile, recordSession, updateProfile } from "./profile.js";
import { scoreProfile, scoreSingle } from "./score.js";

export const core: CoreApi = {
  rulesLabel, labelTurn, emptyProfile, updateProfile, recordSession, scoreProfile, scoreSingle,
};

export * from "./types.js";
