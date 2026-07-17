/**
 * Display metadata for the auto-detected business verticals (report.bot_vertical,
 * keys defined in etl/verticals.mjs). Used to label + group bots in the directory.
 * `order` sorts vertical groups (biggest/most-core first); unknown → end.
 */
export interface VerticalMeta { label: string; emoji: string; order: number }

export const VERTICAL_META: Record<string, VerticalMeta> = {
  ski:             { label: 'Ski Resort',            emoji: '⛷️', order: 1 },
  pass:            { label: 'Multi-Resort Pass',     emoji: '🎟️', order: 2 },
  lodging:         { label: 'Hotel & Lodging',       emoji: '🏨', order: 3 },
  dmo:             { label: 'Destination Marketing', emoji: '🗺️', order: 4 },
  indoor_ski:      { label: 'Indoor Ski Park',       emoji: '🏂', order: 5 },
  waterpark:       { label: 'Water Park',            emoji: '🌊', order: 6 },
  vacation_rental: { label: 'Vacation Rental',       emoji: '🏡', order: 7 },
  transport:       { label: 'Transportation',        emoji: '🚐', order: 8 },
  tour_operator:   { label: 'Tours & Adventure',     emoji: '🧗', order: 9 },
  golf:            { label: 'Golf',                  emoji: '⛳', order: 10 },
  theme_park:      { label: 'Theme Park',            emoji: '🎢', order: 11 },
  campground:      { label: 'Campground & RV',       emoji: '🏕️', order: 12 },
  travel_agency:   { label: 'Travel Agency',         emoji: '✈️', order: 13 },
  event:           { label: 'Events',                emoji: '🎫', order: 14 },
  marketplace:     { label: 'Ticket Marketplace',    emoji: '🛒', order: 15 },
  retailer:        { label: 'Gear Shop & Rentals',   emoji: '🎿', order: 16 },
  travel_insurance:{ label: 'Travel Insurance',      emoji: '🛡️', order: 17 },
  ski_tech:        { label: 'Ski Tech & Platforms',  emoji: '🧰', order: 18 },
  generic:         { label: 'Other / Unclassified',  emoji: '•',  order: 99 },
}

export function verticalMeta(v?: string | null): VerticalMeta {
  return (v && VERTICAL_META[v]) || VERTICAL_META.generic
}
