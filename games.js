/* ============================================================
   Games page — schedule data and rendering
   ============================================================ */

const TODAY = "2026-08-13";
const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

const T = {
    ARI:["Arizona Cardinals",     "State Farm Stadium, Glendale AZ"],
    ATL:["Atlanta Falcons",        "Mercedes-Benz Stadium, Atlanta GA"],
    BAL:["Baltimore Ravens",       "M&T Bank Stadium, Baltimore MD"],
    BUF:["Buffalo Bills",          "Highmark Stadium, Orchard Park NY"],
    CAR:["Carolina Panthers",      "Bank of America Stadium, Charlotte NC"],
    CHI:["Chicago Bears",          "Soldier Field, Chicago IL"],
    CIN:["Cincinnati Bengals",     "Paycor Stadium, Cincinnati OH"],
    CLE:["Cleveland Browns",       "Huntington Bank Field, Cleveland OH"],
    DAL:["Dallas Cowboys",         "AT&T Stadium, Arlington TX"],
    DEN:["Denver Broncos",         "Empower Field at Mile High, Denver CO"],
    DET:["Detroit Lions",          "Ford Field, Detroit MI"],
    GB: ["Green Bay Packers",      "Lambeau Field, Green Bay WI"],
    HOU:["Houston Texans",         "NRG Stadium, Houston TX"],
    IND:["Indianapolis Colts",     "Lucas Oil Stadium, Indianapolis IN"],
    JAX:["Jacksonville Jaguars",   "EverBank Stadium, Jacksonville FL"],
    KC: ["Kansas City Chiefs",     "Arrowhead Stadium, Kansas City MO"],
    LAC:["Los Angeles Chargers",   "SoFi Stadium, Inglewood CA"],
    LAR:["Los Angeles Rams",       "SoFi Stadium, Inglewood CA"],
    LV: ["Las Vegas Raiders",      "Allegiant Stadium, Las Vegas NV"],
    MIA:["Miami Dolphins",         "Hard Rock Stadium, Miami Gardens FL"],
    MIN:["Minnesota Vikings",      "U.S. Bank Stadium, Minneapolis MN"],
    NE: ["New England Patriots",   "Gillette Stadium, Foxborough MA"],
    NO: ["New Orleans Saints",     "Caesars Superdome, New Orleans LA"],
    NYG:["New York Giants",        "MetLife Stadium, East Rutherford NJ"],
    NYJ:["New York Jets",          "MetLife Stadium, East Rutherford NJ"],
    PHI:["Philadelphia Eagles",    "Lincoln Financial Field, Philadelphia PA"],
    PIT:["Pittsburgh Steelers",    "Acrisure Stadium, Pittsburgh PA"],
    SEA:["Seattle Seahawks",       "Lumen Field, Seattle WA"],
    SF: ["San Francisco 49ers",    "Levi's Stadium, Santa Clara CA"],
    TB: ["Tampa Bay Buccaneers",   "Raymond James Stadium, Tampa FL"],
    TEN:["Tennessee Titans",       "Nissan Stadium, Nashville TN"],
    WAS:["Washington Commanders",  "Northwest Stadium, Landover MD"],
    TBD:["TBD",                    "TBD"],
};

function g(away, awayRec, home, homeRec, kickoff, channel, status, awayScore, homeScore) {
    return { away, awayRec, home, homeRec,
             kickoff, channel,
             stadium: T[home]?.[1] ?? "TBD",
             status,
             awayScore: awayScore ?? null,
             homeScore: homeScore ?? null };
}

// ── Full schedule ──────────────────────────────────────────────────────────
const SCHEDULE = [
    // Preseason — Hall of Fame
    {
        date:"2026-07-30", label:"Thu Jul 30",
        weekType:"Preseason", weekLabel:"HOF",
        games:[ g("HOU","0-0","CHI","0-0","8:00 PM ET","NBC","final",17,24) ]
    },
    // Preseason Wk 1
    {
        date:"2026-08-06", label:"Thu Aug 6",
        weekType:"Preseason", weekLabel:"Wk 1",
        games:[
            g("MIA","0-0","BUF","0-0","7:00 PM ET","NFL Net.","final",10,21),
            g("PIT","0-0","BAL","0-0","7:30 PM ET","ESPN","final",14,24),
            g("CAR","0-0","DET","0-0","7:30 PM ET","NFL Net.","final",7,20),
        ]
    },
    {
        date:"2026-08-07", label:"Fri Aug 7",
        weekType:"Preseason", weekLabel:"Wk 1",
        games:[
            g("NYG","0-0","PHI","0-0","7:30 PM ET","Fox","final",10,17),
            g("IND","0-0","CIN","0-0","7:00 PM ET","CBS","final",21,14),
        ]
    },
    {
        date:"2026-08-08", label:"Sat Aug 8",
        weekType:"Preseason", weekLabel:"Wk 1",
        games:[
            g("TEN","0-0","KC","0-0","1:00 PM ET","NFL Net.","final",7,28),
            g("DEN","0-0","LAR","0-0","4:00 PM ET","ESPN","final",17,24),
            g("NO","0-0","ATL","0-0","4:00 PM ET","Fox","final",10,27),
            g("ARI","0-0","LAC","0-0","4:00 PM ET","CBS","final",14,17),
            g("WAS","0-0","MIN","0-0","7:00 PM ET","NFL Net.","final",13,20),
            g("CLE","0-0","SF","0-0","7:00 PM ET","ESPN","final",10,21),
        ]
    },
    {
        date:"2026-08-09", label:"Sat Aug 9",
        weekType:"Preseason", weekLabel:"Wk 1",
        games:[
            g("TB","0-0","GB","0-0","1:00 PM ET","Fox","final",17,24),
            g("DAL","0-0","HOU","0-0","4:00 PM ET","CBS","final",14,20),
            g("JAX","0-0","NE","0-0","7:00 PM ET","NFL Net.","final",21,10),
        ]
    },
    {
        date:"2026-08-10", label:"Mon Aug 10",
        weekType:"Preseason", weekLabel:"Wk 1",
        games:[
            g("LV","0-0","SEA","0-0","8:00 PM ET","ESPN","final",7,24),
            g("NYJ","0-0","CHI","1-0","7:00 PM ET","NFL Net.","final",14,10),
        ]
    },
    // Preseason Wk 2 — TODAY Aug 13
    {
        date:"2026-08-13", label:"Thu Aug 13",
        weekType:"Preseason", weekLabel:"Wk 2",
        games:[
            g("GB","0-1","MIN","1-0","1:00 PM ET","NFL Net.","final",14,27),
            g("TB","0-1","WAS","0-1","4:30 PM ET","Fox","final",20,17),
            g("DAL","0-1","MIA","0-1","8:20 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-14", label:"Fri Aug 14",
        weekType:"Preseason", weekLabel:"Wk 2",
        games:[
            g("JAX","0-1","ATL","1-0","7:00 PM ET","NFL Net.","upcoming",null,null),
            g("CIN","0-1","PIT","0-1","7:30 PM ET","ESPN","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-15", label:"Sat Aug 15",
        weekType:"Preseason", weekLabel:"Wk 2",
        games:[
            g("BAL","1-0","NYJ","1-0","1:00 PM ET","Fox","upcoming",null,null),
            g("DET","1-0","NYG","0-1","1:00 PM ET","CBS","upcoming",null,null),
            g("BUF","1-0","ARI","0-1","4:00 PM ET","ESPN","upcoming",null,null),
            g("KC","1-0","DEN","0-1","4:00 PM ET","Fox","upcoming",null,null),
            g("LAC","1-0","CLE","0-1","4:00 PM ET","CBS","upcoming",null,null),
            g("SF","1-0","NO","0-1","8:00 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-17", label:"Mon Aug 17",
        weekType:"Preseason", weekLabel:"Wk 2",
        games:[
            g("LV","0-1","LAR","1-0","8:00 PM ET","ESPN","upcoming",null,null),
        ]
    },
    // Preseason Wk 3
    {
        date:"2026-08-20", label:"Thu Aug 20",
        weekType:"Preseason", weekLabel:"Wk 3",
        games:[
            g("PHI","1-0","NE","1-0","7:30 PM ET","ESPN","upcoming",null,null),
            g("CHI","1-1","CAR","0-1","7:30 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-21", label:"Fri Aug 21",
        weekType:"Preseason", weekLabel:"Wk 3",
        games:[
            g("CIN","0-2","IND","1-0","7:00 PM ET","CBS","upcoming",null,null),
            g("NO","0-2","TEN","0-1","7:30 PM ET","NFL Net.","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-22", label:"Sat Aug 22",
        weekType:"Preseason", weekLabel:"Wk 3",
        games:[
            g("SEA","1-0","GB","1-1","4:00 PM ET","Fox","upcoming",null,null),
            g("TB","1-1","HOU","1-0","4:00 PM ET","CBS","upcoming",null,null),
            g("DAL","0-2","LAR","1-0","4:00 PM ET","ESPN","upcoming",null,null),
            g("MIN","2-0","PIT","0-2","7:00 PM ET","NBC","upcoming",null,null),
            g("SF","1-0","KC","1-0","7:30 PM ET","NFL Net.","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-24", label:"Mon Aug 24",
        weekType:"Preseason", weekLabel:"Wk 3",
        games:[
            g("NYG","0-2","MIA","0-2","8:00 PM ET","ESPN","upcoming",null,null),
        ]
    },
    // Preseason Wk 4
    {
        date:"2026-08-27", label:"Thu Aug 27",
        weekType:"Preseason", weekLabel:"Wk 4",
        games:[
            g("NE","1-0","NYG","0-3","7:00 PM ET","NFL Net.","upcoming",null,null),
            g("TEN","0-2","IND","1-1","7:30 PM ET","CBS","upcoming",null,null),
            g("PIT","0-2","DET","1-1","7:30 PM ET","ESPN","upcoming",null,null),
            g("ARI","0-2","LAR","1-0","10:00 PM ET","NFL Net.","upcoming",null,null),
        ]
    },
    {
        date:"2026-08-28", label:"Fri Aug 28",
        weekType:"Preseason", weekLabel:"Wk 4",
        games:[
            g("DEN","0-2","DAL","0-3","8:00 PM ET","Fox","upcoming",null,null),
            g("CHI","1-1","MIN","2-1","8:00 PM ET","NBC","upcoming",null,null),
        ]
    },
    // ── Regular Season ────────────────────────────────────────────────────────
    {
        date:"2026-09-03", label:"Thu Sep 3",
        weekType:"Regular Season", weekLabel:"Wk 1",
        games:[ g("KC","0-0","PHI","0-0","8:20 PM ET","NBC","upcoming",null,null) ]
    },
    {
        date:"2026-09-06", label:"Sun Sep 6",
        weekType:"Regular Season", weekLabel:"Wk 1",
        games:[
            g("BUF","0-0","MIA","0-0","1:00 PM ET","CBS","upcoming",null,null),
            g("DET","0-0","MIN","0-0","1:00 PM ET","Fox","upcoming",null,null),
            g("BAL","0-0","PIT","0-0","1:00 PM ET","CBS","upcoming",null,null),
            g("ATL","0-0","CAR","0-0","1:00 PM ET","Fox","upcoming",null,null),
            g("HOU","0-0","IND","0-0","1:00 PM ET","CBS","upcoming",null,null),
            g("NYJ","0-0","NE","0-0","1:00 PM ET","CBS","upcoming",null,null),
            g("DAL","0-0","WAS","0-0","4:25 PM ET","Fox","upcoming",null,null),
            g("SF","0-0","LAR","0-0","4:25 PM ET","Fox","upcoming",null,null),
            g("SEA","0-0","DEN","0-0","4:25 PM ET","CBS","upcoming",null,null),
            g("GB","0-0","CHI","0-0","4:25 PM ET","Fox","upcoming",null,null),
            g("LAC","0-0","LV","0-0","8:20 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2026-09-07", label:"Mon Sep 7",
        weekType:"Regular Season", weekLabel:"Wk 1",
        games:[
            g("CIN","0-0","CLE","0-0","7:30 PM ET","ESPN","upcoming",null,null),
            g("NO","0-0","TB","0-0","8:15 PM ET","ABC","upcoming",null,null),
        ]
    },
    {
        date:"2026-09-10", label:"Thu Sep 10",
        weekType:"Regular Season", weekLabel:"Wk 2",
        games:[ g("KC","1-0","BUF","1-0","8:20 PM ET","NBC","upcoming",null,null) ]
    },
    {
        date:"2026-09-13", label:"Sun Sep 13",
        weekType:"Regular Season", weekLabel:"Wk 2",
        games:[
            g("PHI","1-0","DAL","0-1","1:00 PM ET","Fox","upcoming",null,null),
            g("DET","1-0","GB","0-1","1:00 PM ET","Fox","upcoming",null,null),
            g("BAL","1-0","DEN","0-1","4:25 PM ET","CBS","upcoming",null,null),
            g("SF","1-0","SEA","0-1","4:25 PM ET","Fox","upcoming",null,null),
            g("MIN","1-0","CHI","0-1","1:00 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-09-17", label:"Thu Sep 17",
        weekType:"Regular Season", weekLabel:"Wk 3",
        games:[ g("ATL","1-1","NO","1-1","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-09-20", label:"Sun Sep 20",
        weekType:"Regular Season", weekLabel:"Wk 3",
        games:[
            g("KC","2-0","LAC","1-1","4:25 PM ET","CBS","upcoming",null,null),
            g("PHI","2-0","NE","0-2","1:00 PM ET","CBS","upcoming",null,null),
            g("DET","2-0","WAS","0-2","1:00 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-09-24", label:"Thu Sep 24",
        weekType:"Regular Season", weekLabel:"Wk 4",
        games:[ g("TB","2-1","ATL","2-1","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-09-27", label:"Sun Sep 27",
        weekType:"Regular Season", weekLabel:"Wk 4",
        games:[
            g("PHI","3-0","WAS","0-3","4:25 PM ET","Fox","upcoming",null,null),
            g("BAL","3-0","BUF","2-1","4:25 PM ET","CBS","upcoming",null,null),
            g("SF","2-1","LAR","2-1","4:25 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-10-01", label:"Thu Oct 1",
        weekType:"Regular Season", weekLabel:"Wk 5",
        games:[ g("DET","3-1","MIN","3-1","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-10-04", label:"Sun Oct 4",
        weekType:"Regular Season", weekLabel:"Wk 5",
        games:[
            g("KC","4-0","BUF","2-2","4:25 PM ET","CBS","upcoming",null,null),
            g("GB","2-2","SEA","3-1","1:00 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-10-08", label:"Thu Oct 8",
        weekType:"Regular Season", weekLabel:"Wk 6",
        games:[ g("BAL","4-1","DET","4-1","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-10-11", label:"Sun Oct 11",
        weekType:"Regular Season", weekLabel:"Wk 6",
        games:[
            g("PHI","5-0","LAC","3-2","4:25 PM ET","Fox","upcoming",null,null),
            g("MIN","4-1","SF","3-2","4:25 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-10-15", label:"Thu Oct 15",
        weekType:"Regular Season", weekLabel:"Wk 7",
        games:[ g("GB","3-3","SF","4-2","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-10-18", label:"Sun Oct 18",
        weekType:"Regular Season", weekLabel:"Wk 7",
        games:[
            g("MIN","5-1","DET","4-2","1:00 PM ET","Fox","upcoming",null,null),
            g("KC","5-1","PHI","5-1","4:25 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-10-22", label:"Thu Oct 22",
        weekType:"Regular Season", weekLabel:"Wk 8",
        games:[ g("LAC","4-3","KC","5-1","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-10-25", label:"Sun Oct 25",
        weekType:"Regular Season", weekLabel:"Wk 8",
        games:[
            g("BAL","6-1","PHI","6-1","4:25 PM ET","CBS","upcoming",null,null),
            g("DET","5-2","GB","4-3","1:00 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-10-29", label:"Thu Oct 29",
        weekType:"Regular Season", weekLabel:"Wk 9",
        games:[ g("BUF","4-4","MIA","4-4","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-11-01", label:"Sun Nov 1",
        weekType:"Regular Season", weekLabel:"Wk 9",
        games:[
            g("DET","6-2","GB","5-3","1:00 PM ET","Fox","upcoming",null,null),
            g("BAL","7-1","KC","6-2","4:25 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-11-05", label:"Thu Nov 5",
        weekType:"Regular Season", weekLabel:"Wk 10",
        games:[ g("PHI","7-1","DAL","4-5","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-11-08", label:"Sun Nov 8",
        weekType:"Regular Season", weekLabel:"Wk 10",
        games:[
            g("KC","7-2","DEN","4-5","4:25 PM ET","CBS","upcoming",null,null),
            g("MIN","7-2","GB","5-4","1:00 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-11-12", label:"Thu Nov 12",
        weekType:"Regular Season", weekLabel:"Wk 11",
        games:[ g("MIN","8-2","GB","6-4","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-11-15", label:"Sun Nov 15",
        weekType:"Regular Season", weekLabel:"Wk 11",
        games:[
            g("BAL","9-1","BUF","7-3","4:25 PM ET","CBS","upcoming",null,null),
            g("PHI","9-1","LAC","6-4","4:25 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-11-19", label:"Thu Nov 19",
        weekType:"Regular Season", weekLabel:"Wk 12",
        games:[ g("PHI","9-1","TB","7-3","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-11-22", label:"Sun Nov 22",
        weekType:"Regular Season", weekLabel:"Wk 12",
        games:[
            g("DET","9-2","CHI","6-5","1:00 PM ET","Fox","upcoming",null,null),
            g("KC","9-2","LV","5-6","4:25 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-11-26", label:"Thu Nov 26",
        weekType:"Regular Season", weekLabel:"Wk 13",
        games:[
            g("GB","8-4","DET","9-3","12:30 PM ET","Fox","upcoming",null,null),
            g("PHI","9-1","NYG","4-8","4:30 PM ET","CBS","upcoming",null,null),
            g("MIN","9-3","DAL","5-8","8:20 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2026-11-29", label:"Sun Nov 29",
        weekType:"Regular Season", weekLabel:"Wk 13",
        games:[
            g("KC","10-2","MIN","9-3","4:25 PM ET","CBS","upcoming",null,null),
            g("BAL","10-2","CIN","7-5","1:00 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-12-03", label:"Thu Dec 3",
        weekType:"Regular Season", weekLabel:"Wk 14",
        games:[ g("BUF","9-3","PHI","10-2","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-12-06", label:"Sun Dec 6",
        weekType:"Regular Season", weekLabel:"Wk 14",
        games:[
            g("BAL","11-2","CIN","7-6","1:00 PM ET","CBS","upcoming",null,null),
            g("DET","11-3","MIN","10-4","4:25 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-12-10", label:"Thu Dec 10",
        weekType:"Regular Season", weekLabel:"Wk 15",
        games:[ g("LAC","8-5","KC","11-2","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-12-13", label:"Sun Dec 13",
        weekType:"Regular Season", weekLabel:"Wk 15",
        games:[
            g("PHI","11-3","WAS","9-5","4:25 PM ET","Fox","upcoming",null,null),
            g("BAL","12-2","BUF","10-4","4:25 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2026-12-17", label:"Thu Dec 17",
        weekType:"Regular Season", weekLabel:"Wk 16",
        games:[ g("DET","12-3","GB","9-7","8:20 PM ET","Prime Video","upcoming",null,null) ]
    },
    {
        date:"2026-12-20", label:"Sun Dec 20",
        weekType:"Regular Season", weekLabel:"Wk 16",
        games:[
            g("KC","12-3","BAL","12-2","4:25 PM ET","CBS","upcoming",null,null),
            g("PHI","11-3","DAL","8-8","4:25 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2026-12-26", label:"Sat Dec 26",
        weekType:"Regular Season", weekLabel:"Wk 17",
        games:[
            g("DET","12-3","CHI","6-10","1:00 PM ET","Fox","upcoming",null,null),
            g("BUF","11-4","MIA","7-8","4:30 PM ET","CBS","upcoming",null,null),
            g("GB","10-7","MIN","13-3","8:20 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2026-12-27", label:"Sun Dec 27",
        weekType:"Regular Season", weekLabel:"Wk 17",
        games:[
            g("KC","13-3","LAC","9-7","1:00 PM ET","CBS","upcoming",null,null),
            g("BAL","13-3","CIN","9-8","1:00 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2027-01-03", label:"Sun Jan 3",
        weekType:"Regular Season", weekLabel:"Wk 18",
        games:[
            g("KC","14-2","DEN","7-10","1:00 PM ET","CBS","upcoming",null,null),
            g("PHI","13-3","NYG","6-10","1:00 PM ET","Fox","upcoming",null,null),
            g("DET","14-2","GB","10-8","1:00 PM ET","Fox","upcoming",null,null),
            g("BAL","14-2","CLE","5-12","1:00 PM ET","CBS","upcoming",null,null),
        ]
    },
    // Playoffs
    {
        date:"2027-01-17", label:"Sat Jan 17",
        weekType:"Playoffs", weekLabel:"Wild Card",
        games:[
            g("TBD","0-0","TBD","0-0","1:30 PM ET","NBC","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","5:15 PM ET","Fox","upcoming",null,null),
        ]
    },
    {
        date:"2027-01-18", label:"Sun Jan 18",
        weekType:"Playoffs", weekLabel:"Wild Card",
        games:[
            g("TBD","0-0","TBD","0-0","1:00 PM ET","ESPN","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","4:30 PM ET","CBS","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","8:15 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2027-01-19", label:"Mon Jan 19",
        weekType:"Playoffs", weekLabel:"Wild Card",
        games:[ g("TBD","0-0","TBD","0-0","8:15 PM ET","ABC/ESPN","upcoming",null,null) ]
    },
    {
        date:"2027-01-24", label:"Sat Jan 24",
        weekType:"Playoffs", weekLabel:"Divisional",
        games:[
            g("TBD","0-0","TBD","0-0","4:30 PM ET","Fox","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","8:15 PM ET","NBC","upcoming",null,null),
        ]
    },
    {
        date:"2027-01-25", label:"Sun Jan 25",
        weekType:"Playoffs", weekLabel:"Divisional",
        games:[
            g("TBD","0-0","TBD","0-0","3:00 PM ET","ABC/ESPN","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","6:30 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2027-02-01", label:"Sun Feb 1",
        weekType:"Playoffs", weekLabel:"Conf. Champ",
        games:[
            g("TBD","0-0","TBD","0-0","3:00 PM ET","Fox","upcoming",null,null),
            g("TBD","0-0","TBD","0-0","6:30 PM ET","CBS","upcoming",null,null),
        ]
    },
    {
        date:"2027-02-07", label:"Super Bowl",
        weekType:"Playoffs", weekLabel:"Super Bowl",
        games:[ g("TBD","0-0","TBD","0-0","6:30 PM ET","TBD","upcoming",null,null) ]
    },
];

// ── State ──────────────────────────────────────────────────────────────────
let activeIdx = 0;

// ── Calendar ───────────────────────────────────────────────────────────────
function buildCalendar() {
    const track = document.getElementById("cal-track");
    let prevType = null;

    SCHEDULE.forEach((day, idx) => {
        // Separator when week type changes
        if (prevType && day.weekType !== prevType) {
            const sep = document.createElement("div");
            sep.className = "cal-sep";
            track.appendChild(sep);
        }
        prevType = day.weekType;

        const btn = document.createElement("button");
        btn.className = "cal-day" + (day.date === TODAY ? " today" : "");
        btn.dataset.idx = idx;
        btn.innerHTML = `
            <span class="cal-week">${day.weekLabel}</span>
            <span class="cal-date">${day.label}</span>
        `;
        btn.addEventListener("click", () => showDay(idx));
        track.appendChild(btn);
    });
}

function showDay(idx) {
    activeIdx = idx;

    // Update active class on calendar
    document.querySelectorAll(".cal-day").forEach(el => {
        el.classList.toggle("active", +el.dataset.idx === idx);
    });

    const day = SCHEDULE[idx];

    // Day header
    document.getElementById("day-label").textContent =
        `${day.weekType} ${day.weekLabel} — ${day.label}`;
    document.getElementById("day-badge").textContent =
        day.date === TODAY ? "Today" :
        day.date < TODAY  ? "Final" : "Upcoming";

    // Game cards
    const grid = document.getElementById("games-grid");
    if (!day.games || day.games.length === 0) {
        grid.innerHTML = `<div class="no-games">No games scheduled.</div>`;
        return;
    }
    grid.innerHTML = day.games.map(renderCard).join("");
}

// ── Card rendering ─────────────────────────────────────────────────────────
function renderCard(game) {
    const { status } = game;
    if (status === "final")    return renderFinal(game);
    if (status === "live")     return renderLive(game);
    return renderUpcoming(game);
}

function logoImg(abbr) {
    if (abbr === "TBD") return `<div class="gc-logo" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:1.4rem">🏈</div>`;
    return `<img class="gc-logo" src="${ESPN_LOGO(abbr)}" alt="${abbr}" onerror="this.style.display='none'">`;
}

function renderUpcoming(game) {
    const homeTeamName = T[game.home]?.[0] ?? game.home;
    const awayTeamName = T[game.away]?.[0] ?? game.away;
    return `
<div class="game-card">
  <div class="gc-header">
    <span>${game.kickoff} · ${game.channel}</span>
    <span class="gc-status-badge upcoming">Upcoming</span>
  </div>
  <div class="gc-body">
    <div class="gc-teams">
      <div class="gc-team">
        ${logoImg(game.away)}
        <span class="gc-abbr">${game.away}</span>
        <span class="gc-name">${awayTeamName}</span>
        <span class="gc-record">${game.awayRec}</span>
      </div>
      <div class="gc-center">
        <span class="gc-vs">@</span>
      </div>
      <div class="gc-team">
        ${logoImg(game.home)}
        <span class="gc-abbr">${game.home}</span>
        <span class="gc-name">${homeTeamName}</span>
        <span class="gc-record">${game.homeRec}</span>
      </div>
    </div>
    <div class="gc-footer">
      <div class="gc-stadium">
        <span class="gc-stadium-icon">🏟</span>
        <span>${game.stadium}</span>
      </div>
      <div class="gc-win-pct">
        <div class="gc-pct-bar">
          <span class="pct-abbr">${game.away}</span>
          <span class="pct-val">--%</span>
        </div>
        <div class="gc-pct-bar">
          <span class="pct-abbr">${game.home}</span>
          <span class="pct-val">--%</span>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function renderLive(game) {
    const homeTeamName = T[game.home]?.[0] ?? game.home;
    const awayTeamName = T[game.away]?.[0] ?? game.away;
    return `
<div class="game-card">
  <div class="gc-header">
    <span class="gc-live-info">● LIVE</span>
    <span class="gc-status-badge live">Live</span>
  </div>
  <div class="gc-body">
    <div class="gc-teams">
      <div class="gc-team">
        ${logoImg(game.away)}
        <span class="gc-abbr">${game.away}</span>
        <span class="gc-name">${awayTeamName}</span>
      </div>
      <div class="gc-center">
        <div class="gc-scores">
          <span class="gc-score live">-</span>
          <span class="gc-dash">–</span>
          <span class="gc-score live">-</span>
        </div>
        <span class="gc-live-info">Q- · -:--</span>
        <div class="gc-possession">
          <span class="poss-dot"></span>
          <span>Ball: -</span>
        </div>
      </div>
      <div class="gc-team">
        ${logoImg(game.home)}
        <span class="gc-abbr">${game.home}</span>
        <span class="gc-name">${homeTeamName}</span>
      </div>
    </div>
    <div class="gc-footer">
      <div class="gc-stadium"><span class="gc-stadium-icon">🏟</span>${game.stadium}</div>
    </div>
  </div>
</div>`;
}

function renderFinal(game) {
    const homeTeamName = T[game.home]?.[0] ?? game.home;
    const awayTeamName = T[game.away]?.[0] ?? game.away;
    const homeWon = game.homeScore > game.awayScore;
    const awayWon = game.awayScore > game.homeScore;

    const homeTeamCls = homeWon ? "win-side" : (awayWon ? "loss-side" : "");
    const awayTeamCls = awayWon ? "win-side" : (homeWon ? "loss-side" : "");
    const homeScoreCls = homeWon ? "winner" : (awayWon ? "loser" : "");
    const awayScoreCls = awayWon ? "winner" : (homeWon ? "loser" : "");

    // Updated records (add 1 win or loss from preseason showing)
    function updatedRec(rec, won) {
        if (rec === "0-0" || rec === "TBD" || !rec.includes("-")) return rec;
        let [w, l] = rec.split("-").map(Number);
        if (won) w++; else l++;
        return `${w}-${l}`;
    }
    const awayRecUpd = updatedRec(game.awayRec, awayWon);
    const homeRecUpd = updatedRec(game.homeRec, homeWon);

    return `
<div class="game-card">
  <div class="gc-header">
    <span>${game.channel}</span>
    <span class="gc-status-badge final">Final</span>
  </div>
  <div class="gc-body">
    <div class="gc-teams">
      <div class="gc-team ${awayTeamCls}">
        ${logoImg(game.away)}
        <span class="gc-abbr">${game.away}</span>
        <span class="gc-name">${awayTeamName}</span>
        <span class="gc-record ${awayWon ? "winner" : ""}">${awayRecUpd}</span>
      </div>
      <div class="gc-center">
        <div class="gc-scores">
          <span class="gc-score ${awayScoreCls}">${game.awayScore}</span>
          <span class="gc-dash">–</span>
          <span class="gc-score ${homeScoreCls}">${game.homeScore}</span>
        </div>
      </div>
      <div class="gc-team ${homeTeamCls}">
        ${logoImg(game.home)}
        <span class="gc-abbr">${game.home}</span>
        <span class="gc-name">${homeTeamName}</span>
        <span class="gc-record ${homeWon ? "winner" : ""}">${homeRecUpd}</span>
      </div>
    </div>
    <div class="gc-footer">
      <div class="gc-stadium"><span class="gc-stadium-icon">🏟</span>${game.stadium}</div>
    </div>
  </div>
</div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    buildCalendar();

    // Find today or the next upcoming game day
    let defaultIdx = SCHEDULE.findIndex(d => d.date >= TODAY);
    if (defaultIdx === -1) defaultIdx = SCHEDULE.length - 1;

    showDay(defaultIdx);

    // Scroll the active day into view
    const activeBtn = document.querySelector(".cal-day.active, .cal-day.today");
    if (activeBtn) {
        setTimeout(() => activeBtn.scrollIntoView({ inline: "center", behavior: "smooth" }), 100);
    }
}

document.addEventListener("DOMContentLoaded", init);
