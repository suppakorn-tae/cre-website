import type { components } from '@/lib/api/generated/schema';

import { ApiError } from '@/lib/api/errors';

import { durationDays, isoToThaiInput, parseThaiDateInput } from './dates';

export type ProjectFields = components['schemas']['ProjectFields'];
export type ProjectIsland = components['schemas']['ProjectIsland'];
export type ProjectType = components['schemas']['ProjectType'];
export type Project = components['schemas']['Project'];

/** True when the api refused a create because the account already has the most projects it may own. */
export function isProjectLimitError(failure: unknown): boolean {
  return (
    failure instanceof ApiError &&
    failure.status === 409 &&
    failure.code === 'project_limit_reached'
  );
}

export const ISLAND_CODES: ProjectIsland[] = [
  'koh_tao',
  'koh_samui',
  'koh_phangan',
  'koh_phi_phi',
  'koh_lanta',
  'koh_chang',
  'koh_kood',
  'other',
];
export const TYPE_CODES: ProjectType[] = [
  'building',
  'pier',
  'road',
  'utilities',
  'coastal',
  'other',
];

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 4;
export const NAME_MAX = 120;
export const OTHER_MAX = 60;
export const DESCRIPTION_MAX = 1000;
export const PROGRESS_MAX = 100;
/** The slider thumb snaps to the planned tick within this many percent. */
export const SNAP_RANGE = 2;

/** Form state: everything the user types stays text, so typing is not rewritten. */
export type FormValues = {
  name: string;
  nickname: string;
  islandCode: ProjectIsland | '';
  islandOther: string;
  typeCode: ProjectType | '';
  typeOther: string;
  /** `dd/mm/yyyy` in the Buddhist era. */
  startDate: string;
  endDate: string;
  value: string;
  progress: string;
  description: string;
};

export const emptyForm: FormValues = {
  name: '',
  nickname: '',
  islandCode: '',
  islandOther: '',
  typeCode: '',
  typeOther: '',
  startDate: '',
  endDate: '',
  value: '',
  progress: '0',
  description: '',
};

export type FieldKey = keyof FormValues;
/** Error per field: a key under `projects.form.errors` in the catalogue. */
export type FormErrors = Partial<Record<FieldKey, string>>;

/** Parses a baht amount typed with optional thousands commas. */
export function parseBaht(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

/**
 * Progress in percent; an empty field means the default 0. Whole numbers only:
 * the API and the database keep progress as an integer (IO-196 needs-decision
 * for one decimal place).
 */
export function parseProgress(text: string): number | null {
  const clean = text.trim();
  if (clean === '') return 0;
  if (!/^\d+$/.test(clean)) return null;
  return Number(clean);
}

/**
 * Length the server checks: Unicode code points of the trimmed text. A Thai
 * tone mark or vowel above or below a letter counts as its own code point.
 */
export const length = (text: string) => [...text.trim()].length;

/** Length shown in the "n / max" counter: what the user typed, untrimmed. */
export const typedLength = (text: string) => [...text].length;

/** The slider value after a drag: the planned tick when within `SNAP_RANGE` of it. */
export function snapProgress(value: number, planned: number | null): number {
  if (planned === null) return value;
  return Math.abs(value - planned) <= SNAP_RANGE ? planned : value;
}

export function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const name = length(values.name);
  if (name === 0) errors.name = 'nameRequired';
  else if (name > NAME_MAX) errors.name = 'nameLength';

  const nick = length(values.nickname);
  if (nick === 0) errors.nickname = 'nicknameRequired';
  else if (nick < NICKNAME_MIN || nick > NICKNAME_MAX) errors.nickname = 'nicknameLength';

  if (!values.islandCode) errors.islandCode = 'islandRequired';
  else if (values.islandCode === 'other' && !values.islandOther.trim()) {
    errors.islandOther = 'islandOtherRequired';
  } else if (values.islandCode === 'other' && length(values.islandOther) > OTHER_MAX) {
    errors.islandOther = 'islandOtherLength';
  }

  if (!values.typeCode) errors.typeCode = 'typeRequired';
  else if (values.typeCode === 'other' && !values.typeOther.trim()) {
    errors.typeOther = 'typeOtherRequired';
  } else if (values.typeCode === 'other' && length(values.typeOther) > OTHER_MAX) {
    errors.typeOther = 'typeOtherLength';
  }

  const start = parseThaiDateInput(values.startDate);
  const end = parseThaiDateInput(values.endDate);
  if (!values.startDate.trim()) errors.startDate = 'startRequired';
  else if (!start) errors.startDate = 'dateInvalid';
  if (!values.endDate.trim()) errors.endDate = 'endRequired';
  else if (!end) errors.endDate = 'dateInvalid';
  else if (start && durationDays(start, end) <= 0) errors.endDate = 'endBeforeStart';

  if (!values.value.trim()) errors.value = 'valueRequired';
  else {
    const baht = parseBaht(values.value);
    if (baht === null) errors.value = 'valueInvalid';
    else if (baht <= 0) errors.value = 'valuePositive';
  }

  const progress = parseProgress(values.progress);
  if (progress === null || progress > PROGRESS_MAX) errors.progress = 'progressRange';

  if (length(values.description) > DESCRIPTION_MAX) errors.description = 'descriptionLength';

  return errors;
}

/** Request body from valid form values. Call only when `validateForm` is empty. */
export function toPayload(values: FormValues): ProjectFields {
  const island = values.islandCode as ProjectIsland;
  const type = values.typeCode as ProjectType;
  return {
    name: values.name.trim(),
    nickname: values.nickname.trim(),
    island_code: island,
    island_other: island === 'other' ? values.islandOther.trim() : null,
    type_code: type,
    type_other: type === 'other' ? values.typeOther.trim() : null,
    start_date: parseThaiDateInput(values.startDate) as string,
    end_date: parseThaiDateInput(values.endDate) as string,
    value_baht: parseBaht(values.value) as number,
    progress_pct: parseProgress(values.progress) as number,
    description: values.description.trim() || null,
  };
}

export function fromProject(project: Project): FormValues {
  return {
    name: project.name,
    nickname: project.nickname,
    islandCode: project.island_code,
    islandOther: project.island_other ?? '',
    typeCode: project.type_code,
    typeOther: project.type_other ?? '',
    startDate: isoToThaiInput(project.start_date),
    endDate: isoToThaiInput(project.end_date),
    value: String(project.value_baht),
    progress: String(project.progress_pct),
    description: project.description ?? '',
  };
}
