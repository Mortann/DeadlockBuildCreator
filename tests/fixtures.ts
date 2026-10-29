/** Synthetic records for tests only. Never loaded as player data by the app. */
export const summary = (overrides: Record<string, unknown> = {}) => ({
  account_id: 42,
  match_id: 123456,
  hero_id: 1,
  start_time: 1792497600,
  match_duration_s: 1800,
  net_worth: 27000,
  player_kills: 9,
  player_deaths: 4,
  player_assists: 7,
  player_match_outcome: 1,
  player_team: 0,
  game_mode: 1,
  ...overrides,
})
export const metadata = (overrides: Record<string, unknown> = {}) => ({
  match_info: {
    match_id: 123456,
    start_time: 1792497600,
    duration_s: 1800,
    winning_team: 0,
    match_outcome: 0,
    game_mode: 1,
    players: [
      {
        account_id: 42,
        hero_id: 1,
        team: 0,
        kills: 9,
        deaths: 4,
        assists: 7,
        net_worth: 27000,
        stats: [
          { time_stamp_s: 0, net_worth: 0, shots_hit: 0, shots_missed: 0 },
          { time_stamp_s: 600, net_worth: 8000, shots_hit: 70, shots_missed: 30 },
          { time_stamp_s: 1200, net_worth: 17000, shots_hit: 140, shots_missed: 60 },
          { time_stamp_s: 1800, net_worth: 27000, shots_hit: 210, shots_missed: 90 },
        ],
        items: [
          { game_time_s: 60, item_id: 3077079169, sold_time_s: 0 },
          { game_time_s: 300, item_id: 2064029594, sold_time_s: 1200 },
        ],
        death_details: [{ game_time_s: 900 }, { game_time_s: 1020 }],
      },
      { account_id: 43, hero_id: 13, team: 0, net_worth: 24000, stats: [] },
      { account_id: 44, hero_id: 7, team: 1, net_worth: 32000, stats: [] },
    ],
    ...overrides,
  },
})
export const bundle = { account_id: 42, matches: [summary()], metadata: [metadata()] }
