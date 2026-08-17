# CBREMapLeaseComps
CBRE Map Lease Comps August 2026

## Tools in this repository

- **LeaseCompMapper.html**: maps lease comparables from a spreadsheet on an interactive map and dashboard. Open the file in a browser.
- **wa_healthcare_news_scraper.py**: daily news scraper for Washington State and Puget Sound healthcare, medical office, and life sciences coverage. Details below.

## WA / Puget Sound Healthcare News Scraper

Finds news articles published within the past 24 hours about Washington State and the Puget Sound region, covering:

- healthcare, hospitals, and health systems, including funding, layoffs, and hirings
- healthcare investments and M&A
- medical office developments, investments, funding, and major sales or purchases
- life sciences, pharmaceuticals, biotech, and big pharma, including funding, developments, layoffs, and hirings
- other major healthcare and adjacent news (senior living, behavioral health, payers)

The script queries the Google News RSS search API with region-scoped healthcare queries, optionally Bing News RSS, and a curated list of direct feeds (Seattle Times, GeekWire, Washington State Standard, Axios Seattle, STAT, Endpoints, Fierce Biotech, Fierce Healthcare, Becker's). Every article is filtered for recency, Washington geography (cities, counties, and more than 80 named WA health systems and life science companies), and healthcare relevance, then de-duplicated and grouped into six categories. Stories that mention only the other Washington (D.C.) and crime reports that name a hospital in passing are filtered out.

### Requirements

Python 3.9 or newer. No packages to install; the script uses only the standard library.

### Quick start

```
python3 wa_healthcare_news_scraper.py
```

Each run writes three timestamped reports to `news_reports/` (gitignored):

- `wa_healthcare_news_<stamp>.html`: styled briefing, ready to open or share
- `wa_healthcare_news_<stamp>.md`: Markdown version
- `wa_healthcare_news_<stamp>.json`: full data, including matched keywords and per-source stats

### Common options

```
--hours 48              widen the lookback window (default: 24)
--out-dir reports       change the output directory
--formats html          write only some of md,html,json
--engines google,bing   add Bing News as a second search engine
--extra-query 'TEXT'    add your own search query (repeatable)
--skip-direct-feeds     query the search engines only
--list-sources          print every query and feed, then exit
--insecure              skip TLS verification (only if a corporate proxy
                        intercepts HTTPS and the run fails on certificates)
--verbose               log each fetch and the drop-reason counts
```

Failed sources never abort a run; the summary and reports list them so you know what was missed.

### Scheduling a daily run

Windows Task Scheduler:

```
schtasks /create /tn "WA Healthcare News" /sc daily /st 07:00 ^
  /tr "py -3 C:\path\to\wa_healthcare_news_scraper.py"
```

macOS or Linux cron:

```
0 7 * * * cd /path/to/CBREMapLeaseComps && python3 wa_healthcare_news_scraper.py
```

### Customizing coverage

The keyword lists live at the top of the script and are meant to be edited: `REGION_TERMS`, `WA_HEALTH_SYSTEM_ORGS`, `WA_LIFE_SCIENCE_ORGS`, the topic term lists, `SEARCH_QUERIES`, and `DIRECT_FEEDS`. Add a company or outlet there and it is picked up on the next run.

### Tests

```
python3 test_wa_healthcare_news_scraper.py
```

The tests run fully offline against embedded RSS and Atom fixtures.
