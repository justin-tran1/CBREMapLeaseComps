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

The script queries the Google News RSS search API with region-scoped healthcare queries, optionally Bing News RSS, and a curated list of direct feeds (Seattle Times, GeekWire, Washington State Standard, Axios Seattle, STAT, Endpoints, Fierce Biotech, Fierce Healthcare, Becker's). Every article is filtered for recency, Washington geography (cities, counties, and more than 80 named WA health systems and life science companies), and healthcare relevance, then grouped into six categories. Stories that mention only the other Washington (D.C.) and crime reports that name a hospital in passing are filtered out.

Each report also includes:

- **Key points per article.** The script downloads each article page and pulls out the two or three most informative sentences. Summaries are extractive, so every key point is a verbatim sentence from the article, never invented text.
- **Cross-source consistency checks.** When more than one outlet covers the same story, the script compares dollar amounts, headcounts, square footage, and percentages between them. Every article is marked **Corroborated** (2+ outlets, figures agree), **Single source** (no second outlet found in the scan), or **Discrepancy** (outlets disagree; the conflicting figures are listed so you know what to verify).
- **Daily Digest.** Every report ends with a high-level summary of the day: article and category counts, the lead story per category, the largest dollar/headcount/square-footage figures of the day, and any discrepancy flags.
- **Article images.** Each story card in the HTML report carries the image that best fits the article. The publisher's own choice (the og:image/twitter:image tag) is used first, then feed media, then in-article photos ranked by how well their alt text matches the headline and by size and position. Logos, ads, icons, and tracking pixels are excluded, and an image is dropped whenever the fetched page fails the headline match check. Images are linked from the source site by default; `--embed-images` downloads them into the HTML file so the report is self-contained for emailing, and `--no-images` produces a text-only brief.

### Design

The HTML brief follows the CBRE design system: a CBRE Green masthead carrying the official white wordmark, Financier Display for display headings and Calibre for body text (falling back to Georgia and Arial where those typefaces are not installed), the brand primary and secondary palettes, and the brand status colors for the consistency tags. Copy follows CBRE's AP-modified editorial style: numbers one through nine spelled out, times written as 2:04 p.m. PT, and dates written as August 17, 2026. Every color pairing in the report meets WCAG AA contrast.

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
--no-fetch-articles     skip downloading article pages (faster runs;
                        key points fall back to the RSS snippet)
--max-article-fetches   cap on article pages to download (default: 40)
--embed-images          inline article images into the HTML report
                        (self-contained for emailing; larger file)
--no-images             leave article images out of the reports
--ai                    use Claude for key points, consistency notes,
                        and the digest (needs ANTHROPIC_API_KEY)
--ai-model MODEL        model for --ai (default: claude-fable-5-1;
                        claude-haiku-4-5 is a cheaper option)
--list-sources          print every query and feed, then exit
--insecure              skip TLS verification (only if a corporate proxy
                        intercepts HTTPS and the run fails on certificates)
--verbose               log each fetch and the drop-reason counts
```

Failed sources never abort a run; the summary and reports list them so you know what was missed. Paywalled pages usually yield partial text; the report marks how much of each article was readable.

### Optional AI mode

By default the script is fully self-contained. With `--ai` and an `ANTHROPIC_API_KEY` environment variable set, Claude Fable 5.1 writes the key points and the digest and adds a second opinion to the consistency checks. The script calls the Anthropic API directly over HTTPS, so there is still nothing to install, and it enables server-side refusal fallbacks by default. Fable models require an Anthropic account on 30-day data retention; if that or any other API call fails, the run completes with the built-in summaries instead. Pass `--ai-model claude-haiku-4-5` for a lower-cost option.

```
set ANTHROPIC_API_KEY=sk-ant-...          (Windows)
export ANTHROPIC_API_KEY=sk-ant-...       (macOS/Linux)
python3 wa_healthcare_news_scraper.py --ai
```

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
