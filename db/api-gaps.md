# Tank01 API Gaps & Alternative Sources

## What Tank01 DOES provide
- Game scores, schedules, live scores (getNFLScoresOnly, getNFLGamesForDate)
- Team rosters with position, jersey number, height/weight, college (getNFLTeamRoster)
- Player game logs: passing/rushing/receiving/defense stats per game (getNFLGamesForPlayer)
- Team season stats: wins/losses, PF/PA, yards (getNFLTeams)
- Box scores: per-player stats for a single game (getNFLBoxScore)
- Weekly projections (getNFLProjections)
- Injuries and inactive lists

## What Tank01 does NOT provide

### Play-by-play / Situational
| Missing stat | Why needed | Alternative source |
|---|---|---|
| Expected Points Added (EPA) | Efficiency metric; requires expected value per down/distance | **nflfastR** (R package), nfl-data-py (Python) — free, based on NFL play-by-play |
| Win Probability Added (WPA) | Clutch performance | Same nflfastR/nfl-data-py |
| Air Yards / aDOT | Target depth quality | nfl-data-py (has air_yards per play) |
| Yards After Catch (YAC) | Receiver value | nfl-data-py |
| CPOE (Completion % Over Expected) | QB accuracy vs. difficulty | nflfastR |
| Catchable throw % | QB accuracy | **PFF** (subscription ~$60/yr for fans, free API unavailable) |
| Route running: YPRR (Yards Per Route Run) | WR value per snap | **PFF** or **Next Gen Stats** (NFL.com, no public API) |
| Separation score | WR/TE open vs. coverage | **Next Gen Stats** (NFL.com scrapers exist but fragile) |
| Pressure rate / blitz rate | Pass-rush / OLine quality | nflfastR (has pressure indicators), PFF |
| Drive success rate | Team efficiency | nflfastR (compute from play-by-play) |
| Third-down conversion rate | Situational efficiency | nflfastR or ESPN Stats & Info |

### Advanced tracking (requires RFID/cameras)
| Missing stat | Alternative |
|---|---|
| Route participation rate | Next Gen Stats (no public API) |
| Targeted air yards | nfl-data-py has target_x / yardline data |
| Missed tackle rate | PFF |
| Pass rush win rate | PFF, Next Gen Stats |

### Team/game level
| Missing stat | Alternative |
|---|---|
| O-Line rankings | **PFF** (graded weekly, subscription) |
| Strength of schedule | Compute from own data (opp W-L records) |
| Red zone efficiency | Derive from play-by-play (nflfastR) |
| Time of possession | Available in some box scores but not consistently |

## Free alternatives worth integrating

### 1. nfl-data-py (Python)
```python
import nfl_data_py as nfl
# Play-by-play with EPA, air yards, CPOE — free, weekly updated
pbp = nfl.import_pbp_data([2025])
```
- Data: play-by-play with 200+ columns including EPA, WPA, air_yards, YAC, CPOE
- Cost: free (data hosted on GitHub by nflfastR team)
- Limitation: Python only; data released weekly (not live)

### 2. nflfastR (R) / nfl4th (4th down model)
- Same dataset as nfl-data-py but in R
- Includes win probability, 4th-down decision models

### 3. ESPN Stats & Info (hidden API)
```
https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/statistics
```
- Free, no key required, but unofficial and subject to change
- Provides season-level stats: sacks, turnovers, third-down %, red zone %
- Use for team-level stats only; not per-player play-by-play

### 4. Pro Football Reference (scraping)
- Detailed stats including AV, advanced passing (CPOE-adjacent)
- No public API; scraping allowed per robots.txt with rate limits
- Use sparingly — respect 3+ second delays between requests

### 5. NFL.com Next Gen Stats
- No public API; data accessible via unofficial scraper:
  https://nextgenstats.nfl.com/stats/passing/2025/ALL/
- Provides: aDOT, CPOE, time to throw, separation (WR/TE), route participation

## Recommendation for this project

**Short term (free, low effort):**
- Use ESPN hidden API for team-level stats (third-down %, red zone %) to fill team_game_logs
- `nfl-data-py` via a weekly Python script to pull EPA/WPA/air yards — export to JSON, import to DB

**Medium term:**
- Add a `play_by_play` table or flat JSON files from nflfastR for EPA-based charts
- Replace placeholder charts with real data from nfl-data-py

**Not worth pursuing:**
- PFF: $60+/yr subscription, no bulk export in the fan tier
- Next Gen Stats: no stable API, scraping frequently breaks
