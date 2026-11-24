import type { components } from '@/lib/api/generated/schema';

import { durationDays, isoToThaiInput, parseThaiDateInput } from './dates';

export type ProjectFields = components['schemas']['ProjectFields'];
export type ProjectIsland = components['schemas']['ProjectIsland'];
export type ProjectType = components['schemas']['ProjectType'];
export type Project = components['schemas']['Project'];

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

/** Progress in percent; an empty field means the default 0. */
export function parseProgress(text: string): number | null {
  const clean = text.trim();
  if (clean === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

// Characters as the user sees them: a Thai tone mark counts with its letter.
const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
const length = (text: string) => [...segmenter.segment(text.trim())].length;

export function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = 'nameRequired';

  const nick = length(values.nickname);
  if (nick === 0) errors.nickname = 'nicknameRequired';
  else if (nick < NICKNAME_MIN || nick > NICKNAME_MAX) errors.nickname = 'nicknameLength';

  if (!values.islandCode) errors.islandCode = 'islandRequired';
  else if (values.islandCode === 'other' && !values.islandOther.trim()) {
    errors.islandOther = 'islandOtherRequired';
  }

  if (!values.typeCode) errors.typeCode = 'typeRequired';
  else if (values.typeCode === 'other' && !values.typeOther.trim()) {
    errors.typeOther = 'typeOtherRequired';
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
  if (progress === null || progress > 100) errors.progress = 'progressRange';

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
