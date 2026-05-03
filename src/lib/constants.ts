// Transfer detection
export const TRANSFER_PAIR_DAY_WINDOW = 5;
export const TRANSFER_AMOUNT_TOLERANCE_RATE = 0.005; // 0.5% of amount
export const TRANSFER_AMOUNT_TOLERANCE_FLOOR = 0.02; // R$0.02 absolute minimum
export const TRANSFER_DETECTION_DAYS_BACK = 60;

// AI categorization
export const CATEGORIZE_BATCH_SIZE = 40;
export const CATEGORIZE_MIN_CONFIDENCE = 0.6;
export const CATEGORIZE_CACHE_RULE_MIN_CONFIDENCE = 0.8;
export const CATEGORIZE_MAX_RETRY_PASSES = 20;

// Recurring detection
export const RECURRING_LOOKBACK_MONTHS = 6;
export const RECURRING_CV_THRESHOLD = 0.30; // max coefficient of variation for amount grouping
export const RECURRING_MIN_CONFIDENCE = 0.7;
export const RECURRING_MIN_OCCURRENCES = 2;
