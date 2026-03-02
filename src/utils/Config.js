export const CONFIG = {
  // External services
  EMAIL_DOMAIN: 'phonepe.com',
  GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
  GOOGLE_SHEET_ID: '',  // Paste your sheet ID here

  // Data source: 'seed' | 'google-sheets'
  // Switch to 'google-sheets' once GOOGLE_SHEET_ID is set
  DATA_SOURCE: 'seed',
  SYNC_INTERVAL_MS: 60000,

  // Map
  MAP_SIZE: 100,
  BASE_RADIUS: 6,

  // Unit sight
  SCOUT_SIGHT_RADIUS: 3,
  GATHER_SIGHT_RADIUS: 1,

  // Health signals
  DEADLINE_WARNING_DAYS: 3,       // days before deadline → "at risk"
  WORKLOAD_CAPACITY: 3,           // max active tasks per person before overload
  STAGNATION_DAYS: {              // per-stage days before flagging stagnation
    planning: 5,
    ideating: 5,
    exploration: 7,
    building: 10,
    documenting: 5,
    sharing: 3,
    presenting: 3,
  },
};
