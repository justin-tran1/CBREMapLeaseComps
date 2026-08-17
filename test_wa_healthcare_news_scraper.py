#!/usr/bin/env python3
"""
Offline tests for wa_healthcare_news_scraper.py.

Uses embedded RSS/Atom fixtures (Google News RSS and WordPress-style feeds)
so no network access is required:

    python3 test_wa_healthcare_news_scraper.py
"""

import email.utils
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import wa_healthcare_news_scraper as scraper

NOW = datetime.now(timezone.utc)


def rfc822(dt):
    return email.utils.format_datetime(dt)


def gnews_item(title, source, source_url, published, link):
    return """
    <item>
      <title>{title} - {source}</title>
      <link>{link}</link>
      <guid isPermaLink="false">{link}</guid>
      <pubDate>{pub}</pubDate>
      <description>&lt;a href="{link}"&gt;{title}&lt;/a&gt;&lt;font
        color="#6f6f6f"&gt;{source}&lt;/font&gt;</description>
      <source url="{source_url}">{source}</source>
    </item>""".format(title=title, source=source, source_url=source_url,
                      pub=rfc822(published), link=link)


GNEWS_FIXTURE = ("""<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
<channel>
<title>"query" - Google News</title>
<link>https://news.google.com/search</link>
""" + gnews_item(
    "MultiCare opens new medical office building in Tacoma",
    "Puget Sound Business Journal", "https://www.bizjournals.com/seattle",
    NOW - timedelta(hours=2), "https://news.google.com/rss/articles/aaa111",
) + gnews_item(
    "EvergreenHealth expands Kirkland hospital campus",
    "Seattle Times", "https://www.seattletimes.com",
    NOW - timedelta(hours=120), "https://news.google.com/rss/articles/old99",
) + gnews_item(
    "Olympia lawmakers head to Washington, D.C. for hospital funding talks",
    "The Hill", "https://thehill.com",
    NOW - timedelta(hours=3), "https://news.google.com/rss/articles/dc0001",
) + gnews_item(
    "Man taken to Harborview after shooting in Seattle",
    "KOMO News", "https://komonews.com",
    NOW - timedelta(hours=1), "https://news.google.com/rss/articles/noise1",
) + gnews_item(
    "Providence lays off 120 workers at Everett hospital",
    "Everett Herald", "https://www.heraldnet.com",
    NOW - timedelta(hours=4), "https://news.google.com/rss/articles/wf0001",
) + gnews_item(
    "Sana Biotechnology raises $150M Series B to expand Seattle manufacturing",
    "GeekWire", "https://www.geekwire.com",
    NOW - timedelta(hours=5), "https://news.google.com/rss/articles/inv001",
) + gnews_item(
    "MultiCare opens new medical office building in Tacoma, Wash.",
    "The News Tribune", "https://www.thenewstribune.com",
    NOW - timedelta(hours=6), "https://news.google.com/rss/articles/dup001",
) + gnews_item(
    "Fred Hutch launches cancer vaccine clinical trial",
    "KUOW", "https://www.kuow.org",
    NOW - timedelta(hours=7), "https://news.google.com/rss/articles/ls0001",
) + """
</channel>
</rss>""").encode("utf-8")


WORDPRESS_FIXTURE = ("""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>STAT</title>
<item>
  <title>Washington hospitals brace for Medicaid cuts</title>
  <link>https://www.statnews.com/2026/08/17/wa-medicaid/</link>
  <pubDate>""" + rfc822(NOW - timedelta(hours=8)) + """</pubDate>
  <description><![CDATA[<p>Hospitals across Washington state face budget
    pressure as Medicaid reimbursement changes hit health systems.</p>]]>
  </description>
</item>
<item>
  <title>Texas hospital chain announces expansion</title>
  <link>https://www.statnews.com/2026/08/17/texas/</link>
  <pubDate>""" + rfc822(NOW - timedelta(hours=9)) + """</pubDate>
  <description><![CDATA[Dallas-based system adds beds.]]></description>
</item>
</channel>
</rss>""").encode("utf-8")


ATOM_FIXTURE = ("""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Allen Institute opens Seattle research lab expansion</title>
    <link rel="alternate" href="https://example.org/allen-institute"/>
    <updated>""" + (NOW - timedelta(hours=3)).isoformat() + """</updated>
    <summary>The Allen Institute added 40,000 square feet of lab space
      in Seattle.</summary>
  </entry>
</feed>""").encode("utf-8")


def evaluate(title, summary="", published=None, source_name="",
             source_url="", link="https://example.com/a", **kwargs):
    raw = {"title": title, "summary": summary, "link": link,
           "published": published or NOW - timedelta(hours=1),
           "source_name": source_name, "source_url": source_url}
    return scraper.evaluate_item(raw, origin="test", **kwargs)


class TestParsing(unittest.TestCase):
    def test_google_news_rss(self):
        items = scraper.parse_feed(GNEWS_FIXTURE)
        self.assertEqual(len(items), 8)
        first = items[0]
        self.assertIn("MultiCare opens new medical office", first["title"])
        self.assertEqual(first["source_name"], "Puget Sound Business Journal")
        self.assertEqual(first["source_url"],
                         "https://www.bizjournals.com/seattle")
        self.assertIsNotNone(first["published"])
        self.assertLess((NOW - first["published"]).total_seconds(),
                        3 * 3600)

    def test_wordpress_rss_cdata(self):
        items = scraper.parse_feed(WORDPRESS_FIXTURE)
        self.assertEqual(len(items), 2)
        self.assertIn("Medicaid", items[0]["title"])
        self.assertIn("Washington state", items[0]["summary"])

    def test_atom(self):
        items = scraper.parse_feed(ATOM_FIXTURE)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["link"],
                         "https://example.org/allen-institute")
        self.assertIsNotNone(items[0]["published"])

    def test_bom_handling(self):
        items = scraper.parse_feed(b"\xef\xbb\xbf" + ATOM_FIXTURE)
        self.assertEqual(len(items), 1)

    def test_bad_xml_raises(self):
        with self.assertRaises(Exception):
            scraper.parse_feed(b"<html>not a feed</html><oops")

    def test_parse_date(self):
        self.assertIsNotNone(
            scraper.parse_date("Sun, 17 Aug 2026 08:00:00 GMT"))
        self.assertIsNotNone(scraper.parse_date("2026-08-17T08:00:00Z"))
        self.assertIsNone(scraper.parse_date("not a date"))
        self.assertIsNone(scraper.parse_date(""))
        naive = scraper.parse_date("2026-08-17T08:00:00")
        self.assertEqual(naive.tzinfo, timezone.utc)

    def test_strip_html(self):
        self.assertEqual(
            scraper.strip_html("<p>Hello &amp;   <b>world</b></p>"),
            "Hello & world")

    def test_unwrap_bing_redirect(self):
        wrapped = ("https://www.bing.com/news/apiclick.aspx?ref=FexRss"
                   "&url=https%3A%2F%2Fexample.com%2Fstory&cc=us")
        self.assertEqual(scraper.unwrap_redirect(wrapped),
                         "https://example.com/story")
        plain = "https://example.com/story"
        self.assertEqual(scraper.unwrap_redirect(plain), plain)

    def test_clean_google_title(self):
        self.assertEqual(
            scraper.clean_google_title("Headline here - Seattle Times",
                                       "Seattle Times"),
            "Headline here")


class TestScoring(unittest.TestCase):
    def test_wa_hospital_story_kept(self):
        art, reason = evaluate(
            "MultiCare opens new medical office building in Tacoma")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "medical_office")
        self.assertIn("tacoma", art.region_hits)

    def test_layoffs_categorized_workforce(self):
        art, reason = evaluate(
            "Providence lays off 120 workers at Everett hospital")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "workforce")

    def test_biotech_funding_categorized_investment(self):
        art, reason = evaluate(
            "Sana Biotechnology raises $150M Series B to expand "
            "Seattle manufacturing")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "investment")

    def test_life_sciences_category(self):
        art, reason = evaluate(
            "Fred Hutch launches cancer vaccine clinical trial")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "life_sciences")

    def test_hospital_category(self):
        art, reason = evaluate(
            "UW Medicine reports record patient volumes at Seattle "
            "hospitals")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "hospitals")

    def test_non_wa_dropped(self):
        art, reason = evaluate("Texas hospital chain announces expansion",
                               summary="Dallas-based system adds beds.")
        self.assertIsNone(art)
        self.assertIn("not Washington", reason)

    def test_non_healthcare_dropped(self):
        art, reason = evaluate(
            "Seattle City Council debates transportation levy")
        self.assertIsNone(art)
        self.assertIn("not healthcare", reason)

    def test_dc_story_dropped(self):
        art, reason = evaluate(
            "Olympia lawmakers head to Washington, D.C. for hospital "
            "funding talks")
        self.assertIsNone(art)
        self.assertIn("D.C.", reason)

    def test_dc_mention_with_strong_wa_signal_kept(self):
        art, reason = evaluate(
            "Seattle hospital leaders testify in Washington, D.C. on "
            "Medicaid funding")
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_crime_noise_dropped(self):
        art, reason = evaluate(
            "Man taken to Harborview after shooting in Seattle")
        self.assertIsNone(art)
        self.assertIn("incidental", reason)

    def test_strong_topic_survives_noise_terms(self):
        art, reason = evaluate(
            "MultiCare medical office building construction continues "
            "in Tacoma after crash on site")
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_wa_source_domain_satisfies_region(self):
        art, reason = evaluate(
            "Local health system announces new hospital wing",
            source_name="Seattle Times",
            source_url="https://www.seattletimes.com")
        self.assertIsNone(reason)
        self.assertTrue(
            any(h.startswith("wa-source:") for h in art.region_hits))

    def test_topic_implied_feed(self):
        art, reason = evaluate(
            "Washington state officials weigh new rules",
            summary="Rulemaking continues in Olympia.",
            topic_implied=True)
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_region_implied_feed(self):
        art, reason = evaluate(
            "New behavioral health clinic opens downtown",
            region_implied=True)
        self.assertIsNone(reason)
        self.assertIn("regional-feed", art.region_hits)


class TestDedupe(unittest.TestCase):
    def _art(self, title, url, hours_ago=1, score=5):
        return scraper.Article(
            title=title, url=url, source="s",
            published=NOW - timedelta(hours=hours_ago), score=score)

    def test_near_duplicate_titles_collapse(self):
        arts = [
            self._art("MultiCare opens new medical office building in "
                      "Tacoma", "https://a.com/1", score=9),
            self._art("MultiCare opens new medical office building in "
                      "Tacoma, Wash.", "https://b.com/2", score=5),
        ]
        kept = scraper.dedupe(arts)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].url, "https://a.com/1")  # higher score wins

    def test_same_url_collapses(self):
        arts = [self._art("Title one here", "https://a.com/x"),
                self._art("Completely different title", "https://a.com/x")]
        self.assertEqual(len(scraper.dedupe(arts)), 1)

    def test_distinct_articles_kept(self):
        arts = [self._art("Providence lays off 120 workers in Everett",
                          "https://a.com/1"),
                self._art("Fred Hutch launches cancer vaccine trial",
                          "https://b.com/2")]
        self.assertEqual(len(scraper.dedupe(arts)), 2)


class TestPipeline(unittest.TestCase):
    def _run(self, fetcher, extra_argv=None):
        argv = ["--delay", "0", "--engines", "google"]
        argv += extra_argv or []
        args = scraper.parse_args(argv)
        return scraper.run(args, fetcher=fetcher), args

    def test_end_to_end_with_fixtures(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            if "statnews.com" in url:
                return WORDPRESS_FIXTURE
            raise OSError("offline")

        (grouped, flat, meta), args = self._run(fetcher)
        titles = [a.title for a in flat]
        # Kept: medical office opener, layoffs, biotech raise, Fred Hutch,
        # and the STAT Medicaid story.
        self.assertEqual(meta["kept"], 5)
        self.assertTrue(any("MultiCare opens" in t for t in titles))
        self.assertTrue(any("lays off" in t for t in titles))
        self.assertTrue(any("Medicaid cuts" in t for t in titles))
        # Dropped: stale item, D.C. item, crime item, Texas item, near-dup.
        self.assertNotIn(
            "EvergreenHealth expands Kirkland hospital campus", titles)
        self.assertNotIn(
            "Man taken to Harborview after shooting in Seattle", titles)
        self.assertFalse(any("Texas" in t for t in titles))
        self.assertEqual(
            sum(1 for t in titles if "MultiCare opens" in t), 1)
        # Categories present and ordered per CATEGORY_ORDER.
        keys = [k for k, _t, _a in grouped]
        self.assertEqual(keys, [k for k, _ in scraper.CATEGORY_ORDER
                                if k in keys])
        # Google title suffix stripped, source preserved.
        mo = next(a for a in flat if "MultiCare opens" in a.title)
        self.assertEqual(mo.source, "Puget Sound Business Journal")
        self.assertNotIn(" - Puget Sound Business Journal", mo.title)
        # Feed failures recorded but do not abort the run.
        self.assertGreater(meta["sources_ok"], 0)
        self.assertLess(meta["sources_ok"], meta["sources_total"])

    def test_all_sources_failed(self):
        def fetcher(url, timeout=None, ctx=None):
            raise OSError("offline")

        (grouped, flat, meta), _args = self._run(fetcher)
        self.assertEqual(meta["sources_ok"], 0)
        self.assertEqual(meta["kept"], 0)
        self.assertEqual(grouped, [])

    def test_reports_written(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            raise OSError("offline")

        with tempfile.TemporaryDirectory() as tmp:
            (grouped, flat, meta), args = self._run(
                fetcher, ["--out-dir", tmp, "--skip-direct-feeds"])
            written = scraper.write_reports(grouped, flat, meta, args)
            exts = sorted(p.suffix for p in written)
            self.assertEqual(exts, [".html", ".json", ".md"])
            for path in written:
                self.assertTrue(Path(path).exists())
            html_text = next(p for p in written
                             if p.suffix == ".html").read_text("utf-8")
            self.assertIn("MultiCare opens new medical office building",
                          html_text)
            self.assertIn("Puget Sound Healthcare News", html_text)
            data = json.loads(next(p for p in written
                                   if p.suffix == ".json").read_text("utf-8"))
            self.assertEqual(data["article_count"], len(data["articles"]))
            self.assertTrue(all(a["category"] for a in data["articles"]))
            md_text = next(p for p in written
                           if p.suffix == ".md").read_text("utf-8")
            self.assertIn("## ", md_text)

    def test_hours_window_respected(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            raise OSError("offline")

        (grouped, flat, meta), _args = self._run(
            fetcher, ["--hours", "168", "--skip-direct-feeds"])
        titles = [a.title for a in flat]
        # The 120-hour-old EvergreenHealth story now falls inside the window.
        self.assertTrue(any("EvergreenHealth" in t for t in titles))


class TestUrlBuilders(unittest.TestCase):
    def test_google_news_url(self):
        url = scraper.google_news_url('hospital "Puget Sound"', 24)
        self.assertIn("news.google.com/rss/search", url)
        self.assertIn("when%3A1d", url)
        url12 = scraper.google_news_url("x", 12)
        self.assertIn("when%3A12h", url12)
        url48 = scraper.google_news_url("x", 48)
        self.assertIn("when%3A2d", url48)

    def test_bing_news_url(self):
        url = scraper.bing_news_url("hospital Seattle")
        self.assertIn("bing.com/news/search", url)
        self.assertIn("format=rss", url)

    def test_build_source_list(self):
        args = scraper.parse_args(["--engines", "google,bing"])
        sources = scraper.build_source_list(args)
        labels = [s[0] for s in sources]
        n_queries = len(scraper.SEARCH_QUERIES)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("google:")), n_queries)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("bing:")), n_queries)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("feed:")),
            len(scraper.DIRECT_FEEDS))

    def test_extra_query(self):
        args = scraper.parse_args(["--extra-query", '"Providence" layoffs'])
        sources = scraper.build_source_list(args)
        self.assertTrue(any("extra-1" in s[0] for s in sources))


if __name__ == "__main__":
    unittest.main(verbosity=2)
