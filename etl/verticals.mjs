/**
 * verticals.mjs — the shared vertical preset registry. Single source of truth for:
 *   • vertical AUTO-DETECTION (detect-vertical.mjs picks a key using `desc`)
 *   • enrichment SECTIONS   (enrich.mjs uses `sections` for the detected vertical)
 *
 * Each vertical: { label, desc (for the detector), sections (the per-vertical
 * "what they ask about" taxonomy) }. Every section list starts with 'General Info'
 * and ends with 'Ecommerce / Account Management', 'Other' for cross-portfolio
 * consistency. ski/pass/indoor_ski/waterpark/lodging/transport/marketplace/event
 * are DATA-VALIDATED (<5% "Other" on real convs). golf/theme_park/campground/dmo/
 * tour_operator/vacation_rental are DRAFTS — validated by the "Other" rate as
 * clients in those verticals come online. `generic` is the low-confidence fallback.
 */
export const VERTICALS = {
  ski: { label: 'ski resort', desc: 'single ski/snowboard resort — lift tickets, lessons, rentals, trails, snow conditions',
    sections: ['General Info', 'Tickets', 'Season Passes', 'Partner Pass Programs', 'Ski & Snowboard Lessons', 'Ski & Snowboard Rentals', 'Refund Policies', 'Winter Activities', 'Tubing', 'Summer Activities', 'Lodging', 'Dining & Après', 'Guest Services & Safety', 'Parking & Transit', 'Events', 'Pet & Service Animals', 'Packing & Gear', 'Employment', 'Ecommerce / Account Management', 'Other'] },
  pass: { label: 'multi-resort ski pass', desc: 'season or multi-resort ski PASS product — member resorts, blackout dates, pass tiers, member management',
    sections: ['General Info', 'Pass Products & Pricing', 'Partner & Member Resorts', 'Reservations & Blackout Dates', 'Account / Access', 'Adding & Managing Members', 'Renewals', 'Refund Policies', 'Payments & Billing', 'Benefits & Discounts', 'Ecommerce / Account Management', 'Other'] },
  indoor_ski: { label: 'indoor ski & snow park', desc: 'indoor ski or snow park — timed sessions, indoor slope, snow play',
    sections: ['General Info', 'Tickets & Sessions', 'Season Passes', 'Lessons', 'Rentals', 'Groups & Parties', 'Hours & Access', 'Dining', 'Refund Policies', 'Parking & Directions', 'Safety & Rules', 'Ecommerce / Account Management', 'Other'] },
  waterpark: { label: 'water park', desc: 'indoor or outdoor water park — day passes, cabanas, water rides, slides',
    sections: ['General Info', 'Day Passes & Tickets', 'Cabanas & Rentals', 'Hotel & Lodging Packages', 'Groups & Parties', 'Hours & Seasons', 'Height, Age & Safety Rules', 'Dining', 'Refund Policies', 'Parking & Directions', 'Events', 'Ecommerce / Account Management', 'Other'] },
  lodging: { label: 'resort lodging / hotel', desc: 'hotel or resort lodging — rooms, rates, amenities, check-in',
    sections: ['General Info', 'Rooms & Rates', 'Availability & Booking', 'Amenities', 'Dining', 'Packages & Deals', 'Check-in / Check-out & Policies', 'Groups & Events', 'Parking & Transit', 'Refund / Cancellation Policies', 'Ecommerce / Account Management', 'Other'] },
  vacation_rental: { label: 'vacation rental / property mgmt', desc: 'vacation rental or property management company — individual rental homes, condos, cabins',
    sections: ['General Info', 'Property Search & Availability', 'Rates & Fees', 'Booking & Reservations', 'Amenities & Property Details', 'Check-in / Check-out & Access', 'House Rules & Policies', 'Refund / Cancellation Policies', 'Owner & Host Services', 'Ecommerce / Account Management', 'Other'] },
  golf: { label: 'golf course / golf resort', desc: 'golf course or golf resort — tee times, memberships, pro shop, lessons',
    sections: ['General Info', 'Tee Times & Booking', 'Rates & Memberships', 'Lessons & Clinics', 'Pro Shop & Rentals', 'Course Conditions & Rules', 'Events & Outings', 'Dining & Clubhouse', 'Lodging & Stay-and-Play', 'Refund / Cancellation Policies', 'Ecommerce / Account Management', 'Other'] },
  theme_park: { label: 'theme park / attraction', desc: 'theme park or attraction — rides, admission, season passes',
    sections: ['General Info', 'Tickets & Admission', 'Season Passes', 'Rides & Attractions', 'Height, Age & Safety', 'Hours & Calendar', 'Groups & Parties', 'Dining', 'Parking & Directions', 'Refund Policies', 'Ecommerce / Account Management', 'Other'] },
  campground: { label: 'campground / RV park', desc: 'campground or RV park — sites, hookups, reservations, amenities',
    sections: ['General Info', 'Reservations & Availability', 'Sites & Rates', 'Amenities & Hookups', 'Rules & Policies', 'Activities & Recreation', 'Check-in / Check-out', 'Groups & Events', 'Refund / Cancellation Policies', 'Ecommerce / Account Management', 'Other'] },
  transport: { label: 'ground transportation / shuttle', desc: 'ground-transportation or shuttle service — rides, routes, airport transfers, fares',
    sections: ['General Info', 'Booking a Ride', 'Schedules & Routes', 'Pickup & Dropoff Locations', 'Pricing & Fares', 'Airport Transfers', 'Group & Charter', 'Changes & Cancellations', 'Luggage & Equipment', 'Refund Policies', 'Ecommerce / Account Management', 'Other'] },
  tour_operator: { label: 'tour operator / adventure recreation', desc: 'guided tours or adventure recreation — rafting, guided trips, excursions, activities',
    sections: ['General Info', 'Trip & Tour Options', 'Booking & Availability', 'Pricing & Packages', "What's Included & Gear", 'Difficulty & Requirements', 'Group & Private Tours', 'Weather & Cancellation Policy', 'Safety & Waivers', 'Refund Policies', 'Ecommerce / Account Management', 'Other'] },
  dmo: { label: 'visitors bureau / destination marketing', desc: 'destination marketing org or visitors bureau — things to do, events, trip planning for a whole region',
    sections: ['General Info', 'Things to Do & Attractions', 'Events & Festivals', 'Lodging & Where to Stay', 'Dining & Nightlife', 'Trip Planning & Itineraries', 'Transportation & Getting Around', 'Deals & Passes', 'Visitor Services', 'Ecommerce / Account Management', 'Other'] },
  travel_agency: { label: 'travel agency', desc: 'travel agency — trip packages, booking, quotes, itineraries',
    sections: ['General Info', 'Trip Packages', 'Booking & Reservations', 'Pricing & Quotes', 'Destinations & Activities', 'Lodging & Flights', 'Changes & Cancellations', 'Payments & Billing', 'Groups', 'Refund Policies', 'Ecommerce / Account Management', 'Other'] },
  event: { label: 'event / event venue', desc: 'an event, race, or event venue — registration, entry, event tickets, schedule',
    sections: ['General Info', 'Registration & Entry', 'Categories & Courses', 'Pricing & Packages', 'Schedule & Logistics', 'Lodging & Travel', 'Rules & Requirements', 'Transfers & Refunds', 'Merchandise', 'Volunteering', 'Ecommerce / Account Management', 'Other'] },
  marketplace: { label: 'lift-ticket marketplace / reseller', desc: 'multi-resort lift-ticket marketplace or reseller — discount tickets across many resorts',
    sections: ['General Info', 'Finding Tickets & Passes', 'Pricing & Availability', 'Booking & Checkout', 'Order Lookup & Changes', 'Payments & Billing', 'Resort Information', 'Refund Policies', 'Account / Access', 'Ecommerce / Account Management', 'Other'] },
  generic: { label: 'tourism / leisure (fallback)', desc: 'use only when the vertical is genuinely unclear or novel',
    sections: ['General Info', 'Products & Services', 'Pricing & Availability', 'Booking & Reservations', 'Account / Access', 'Refund / Cancellation Policies', 'Ecommerce / Account Management', 'Other'] },
}

// Universal intent every vertical shares: callers/guests who just want a human, with
// NO knowledge question (e.g. "transfer me to an agent"). Voice especially — ~30% of
// calls are pure "connect me to a person" (vs ~1% on chat). Inject it before 'Other'
// so it's a real section across every preset instead of polluting 'Other'. It mirrors
// the universal SPINE category 'Human / Escalation'.
for (const v of Object.values(VERTICALS)) {
  if (!v.sections.includes('Live Agent Request')) {
    const i = v.sections.indexOf('Other')
    v.sections.splice(i < 0 ? v.sections.length : i, 0, 'Live Agent Request')
  }
}

// Promotion status. 'active' = VALIDATED on real data (measured 2026-07-09: meaningful
// volume + <~4% "Other"). 'draft' = no validating data yet (validate via the "Other"
// rate when a client in that vertical comes online). 'fallback' = generic. Drives the
// preset-library UI's ACTIVE-vs-EXAMPLE badge. Enrichment uses any of them regardless.
const ACTIVE = new Set(['ski', 'pass', 'lodging', 'waterpark', 'transport', 'marketplace'])
for (const [k, v] of Object.entries(VERTICALS)) {
  v.status = k === 'generic' ? 'fallback' : (ACTIVE.has(k) ? 'active' : 'draft')
}

/** Confidence gate: below this, enrichment uses the `generic` preset instead of the
 *  detected vertical (the detector self-flags novel/ambiguous bots with low scores). */
export const MIN_CONFIDENCE = 0.6

/** Resolve the section list to use for a bot, given its detected row (or none). */
export function sectionsFor(vertical, confidence) {
  const v = confidence != null && confidence < MIN_CONFIDENCE ? 'generic' : vertical
  return (VERTICALS[v] || VERTICALS.generic).sections
}

// Shared "tail" sections every preset ends with — deduped once at the end of a
// composite, never duplicated in the middle.
const TAIL = ['Ecommerce / Account Management', 'Live Agent Request', 'Other']

/**
 * COMPOSITE taxonomy for a multi-facet bot (e.g. a ski resort that ALSO has a water
 * park): union of the primary + any secondary verticals' sections, primary first,
 * de-duped, with the universal tail (Ecommerce / Live Agent / Other) once at the end.
 * So "lift ticket" → ski's Tickets and "cabana" → waterpark's Cabanas both have a home.
 */
export function compositeSections(primary, also = []) {
  const keys = [primary, ...(also || [])].filter((k) => VERTICALS[k])
  if (keys.length === 0) return VERTICALS.generic.sections
  const seen = new Set(), out = []
  for (const k of keys) {
    for (const s of VERTICALS[k].sections) {
      if (TAIL.includes(s) || seen.has(s)) continue
      seen.add(s); out.push(s)
    }
  }
  return [...out, ...TAIL]
}

/** A human label for a bot's (possibly composite) vertical, for prompts + badges. */
export function verticalLabel(primary, also = []) {
  const keys = [primary, ...(also || [])].filter((k) => VERTICALS[k])
  return keys.map((k) => VERTICALS[k].label).join(' + ') || VERTICALS.generic.label
}
