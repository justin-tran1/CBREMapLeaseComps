#!/usr/bin/env python3
"""
WA / Puget Sound Healthcare News Scraper
=========================================

Searches for news articles published within the past 24 hours (configurable)
about Washington State and the Puget Sound region covering:

  * healthcare, healthcare investments, hospital and health system news
  * health system layoffs, hirings, and funding
  * medical office developments, investments, funding, and sales/purchases
  * life sciences, pharmaceuticals, biotech, and big pharma news
    (including layoffs/hirings, developments, funding, and investments)
  * other major healthcare / medical / medical office adjacent news

How it works
------------
1. Runs a set of targeted queries against the Google News RSS search API
   (and optionally Bing News RSS) scoped to Washington State / Puget Sound
   geography and healthcare topics.
2. Pulls a curated list of direct RSS feeds from regional outlets
   (Seattle Times, GeekWire, ...) and national healthcare/biotech trade
   press (STAT, Endpoints, Fierce Biotech, ...).
3. Filters every article by recency (default: past 24 hours), geographic
   relevance (WA cities/counties, Puget Sound, WA health systems and
   life-science companies), and topic relevance (healthcare keyword sets).
4. De-duplicates near-identical stories syndicated across sources.
5. Writes Markdown, HTML, and JSON reports grouped by category.

Requires only the Python 3.9+ standard library -- no pip installs.

Usage
-----
    python3 wa_healthcare_news_scraper.py
    python3 wa_healthcare_news_scraper.py --hours 48 --out-dir reports
    python3 wa_healthcare_news_scraper.py --list-sources
    python3 wa_healthcare_news_scraper.py --extra-query '"Providence" layoffs'

Run with --help for all options.
"""

from __future__ import annotations

import argparse
import email.utils
import html as html_lib
import json
import math
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

VERSION = "1.0.0"
USER_AGENT = (
    "Mozilla/5.0 (compatible; WAHealthcareNewsScraper/" + VERSION + "; "
    "+https://github.com/justin-tran1/CBREMapLeaseComps)"
)
DEFAULT_HOURS = 24
DEFAULT_OUT_DIR = "news_reports"
DEFAULT_TIMEOUT = 20
DEFAULT_DELAY = 0.4  # polite pause between HTTP requests, seconds

# ---------------------------------------------------------------------------
# Geography: Washington State / Puget Sound signals
# ---------------------------------------------------------------------------
# (phrase, weight). Bare "Washington" is deliberately NOT a region signal --
# it is too easy to confuse with Washington, D.C. Unambiguous phrases only.

REGION_TERMS = [
    ("washington state", 2), ("state of washington", 2), ("puget sound", 2),
    ("western washington", 2), ("eastern washington", 2),
    ("southwest washington", 2), ("central washington", 1),
    ("evergreen state", 1), ("pacific northwest", 1),
    ("seattle", 2), ("tacoma", 2), ("spokane", 2), ("bellevue", 2),
    ("everett", 2),
    ("olympia", 1), ("bothell", 1), ("kirkland", 1), ("redmond", 1),
    ("renton", 1), ("kent", 1), ("federal way", 1), ("lynnwood", 1),
    ("edmonds", 1), ("issaquah", 1), ("sammamish", 1), ("bremerton", 1),
    ("silverdale", 1), ("poulsbo", 1), ("gig harbor", 1), ("puyallup", 1),
    ("bellingham", 1), ("wenatchee", 1), ("yakima", 1), ("kennewick", 1),
    ("pasco", 1), ("richland", 1), ("walla walla", 1), ("pullman", 1),
    ("tukwila", 1), ("seatac", 1), ("sea-tac", 1), ("burien", 1),
    ("mercer island", 1), ("woodinville", 1), ("lacey", 1), ("tumwater", 1),
    ("port angeles", 1), ("port townsend", 1), ("anacortes", 1),
    ("moses lake", 1), ("ellensburg", 1), ("centralia", 1), ("chehalis", 1),
    ("snoqualmie", 1), ("mount vernon, wash", 1), ("vancouver, wash", 1),
    ("vancouver, washington", 1), ("tri-cities, wash", 1),
    ("king county", 1), ("pierce county", 1), ("snohomish county", 1),
    ("kitsap county", 1), ("kitsap peninsula", 1), ("thurston county", 1),
    ("whatcom county", 1), ("skagit county", 1), ("spokane county", 1),
    ("yakima county", 1), ("chelan county", 1), ("island county", 1),
    ("grays harbor", 1), ("south lake union", 1), ("first hill", 1),
]

# News outlets whose coverage is inherently Washington-focused. When an
# article's source domain matches, the region requirement is satisfied.
WA_SOURCE_DOMAINS = {
    "seattletimes.com", "geekwire.com", "king5.com", "kiro7.com",
    "komonews.com", "fox13seattle.com", "mynorthwest.com", "heraldnet.com",
    "everettpost.com", "thenewstribune.com", "spokesman.com", "krem.com",
    "kxly.com", "khq.com", "kuow.org", "knkx.org", "cascadepbs.org",
    "crosscut.com", "seattlemet.com", "washingtonstatestandard.com",
    "columbian.com", "kitsapsun.com", "theolympian.com",
    "bellinghamherald.com", "tri-cityherald.com", "yakimaherald.com",
    "wenatcheeworld.com", "seattlepi.com", "thestranger.com",
    "seattlemedium.com", "kentreporter.com", "bellevuereporter.com",
    "westsideseattle.com", "dailyuw.com", "spokanejournal.com",
    "sanjuanjournal.com", "peninsuladailynews.com", "goskagit.com",
    "chronline.com", "thedailyworld.com", "unionbulletin.com",
    "dailyrecordnews.com", "auburn-reporter.com", "courierherald.com",
}
# bizjournals.com hosts ~45 metro papers; only the Seattle one implies WA.
WA_SOURCE_URL_SUBSTRINGS = ("bizjournals.com/seattle",)

# ---------------------------------------------------------------------------
# Washington healthcare organizations (satisfy BOTH region and topic)
# ---------------------------------------------------------------------------

WA_HEALTH_SYSTEM_ORGS = [
    "uw medicine", "uw medical center", "harborview", "multicare",
    "virginia mason", "seattle children's", "fred hutchinson", "fred hutch",
    "evergreenhealth", "overlake", "providence swedish",
    "swedish health services", "peacehealth", "kaiser permanente washington",
    "confluence health", "kadlec", "providence sacred heart",
    "providence st. peter", "providence regional medical center",
    "st. michael medical center", "tacoma general", "mary bridge",
    "sea mar", "olympic medical center", "jefferson healthcare",
    "skagit regional health", "whidbeyhealth", "summit pacific medical",
    "mason general", "astria health", "yakima valley memorial",
    "trios health", "pullman regional", "providence holy family",
    "community health plan of washington",
    "washington state hospital association",
    "washington state department of health", "premera",
    "proliance surgeons", "pacific medical centers", "the polyclinic",
    "bloodworks northwest", "seattle cancer care alliance",
    "seattle indian health board", "international community health services",
    "neighborcare health", "healthpoint", "valley view health center",
]

WA_LIFE_SCIENCE_ORGS = [
    "sana biotechnology", "adaptive biotechnologies", "seagen",
    "juno therapeutics", "nautilus biotechnology", "absci",
    "alpine immune sciences", "chinook therapeutics", "umoja biopharma",
    "shape therapeutics", "icosavax", "athira pharma", "omeros",
    "atossa therapeutics", "achieve life sciences", "impel pharmaceuticals",
    "lumen bioscience", "curi bio", "variant bio", "phase genomics",
    "a-alpha bio", "monod bio", "outpace bio", "tune therapeutics",
    "allen institute", "institute for systems biology",
    "benaroya research institute", "access to advanced health institute",
    "gates foundation", "bill & melinda gates foundation", "truveta",
    "98point6", "fujifilm sonosite", "pnnl", "washington research foundation",
    "life science washington",
]

# National/multi-state healthcare organizations: count toward the healthcare
# topic but NOT toward Washington geography (e.g. Providence also operates
# in five other states; "Providence" alone may be Rhode Island).
NATIONAL_HEALTH_ORGS = [
    "providence", "kaiser permanente", "commonspirit", "optum",
    "unitedhealth", "hca healthcare", "molina healthcare", "regence",
    "cigna", "elevance", "centene", "davita", "fresenius",
]

# ---------------------------------------------------------------------------
# Topic keyword sets. Weights feed both qualification and categorization.
# ---------------------------------------------------------------------------

MEDICAL_OFFICE_TERMS = [
    ("medical office", 3), ("medical offices", 3),
    ("medical office building", 3), ("healthcare real estate", 3),
    ("health care real estate", 3), ("medical real estate", 3),
    ("medical building", 3), ("medical campus", 3), ("medical tower", 3),
    ("medical plaza", 3), ("medical pavilion", 3), ("medical district", 2),
    ("outpatient center", 3), ("outpatient clinic", 3),
    ("outpatient facility", 3), ("ambulatory surgery center", 3),
    ("surgery center", 3), ("surgical center", 3), ("specialty clinic", 2),
    ("clinic building", 3), ("health campus", 2), ("hospital campus", 2),
    ("hospital expansion", 3), ("clinic opening", 3), ("clinic closure", 3),
    ("new clinic", 2), ("healthcare property", 3), ("medical property", 3),
    ("life science real estate", 3), ("lab space", 2), ("wet lab", 2),
    ("research campus", 2), ("biotech hub", 2), ("innovation district", 1),
    ("senior housing", 2), ("assisted living facility", 2),
    ("skilled nursing facility", 2), ("medical suites", 2),
]

# Real-estate transaction language. Adds category weight for the medical
# office bucket but does NOT by itself qualify an article as healthcare.
RE_SIGNAL_TERMS = [
    ("square feet", 1), ("square foot", 1), ("square-foot", 1),
    ("sq. ft", 1), ("lease", 1), ("leases", 1), ("leased", 1),
    ("leasing", 1), ("sublease", 1), ("tenant", 1), ("landlord", 1),
    ("developer", 1), ("development", 1), ("groundbreaking", 1),
    ("breaks ground", 1), ("broke ground", 1), ("construction", 1),
    ("zoning", 1), ("rezone", 1), ("permits", 1), ("reit", 1),
    ("cap rate", 1), ("renovation", 1), ("build-out", 1), ("property", 1),
    ("sells", 1), ("sold", 1), ("sale", 1), ("purchase", 1),
    ("purchased", 1), ("buys", 1), ("acquires", 1),
]

WORKFORCE_TERMS = [
    ("layoff", 3), ("layoffs", 3), ("lay off", 3), ("lays off", 3),
    ("laying off", 3), ("job cuts", 3), ("cuts jobs", 3), ("cutting jobs", 3),
    ("workforce reduction", 3), ("reduction in force", 3), ("furlough", 3),
    ("furloughs", 3), ("warn notice", 3), ("hiring", 2), ("hires", 1),
    ("new jobs", 2), ("adding jobs", 2), ("job fair", 2),
    ("staffing shortage", 2), ("staff shortage", 2), ("nursing shortage", 2),
    ("strike", 2), ("walkout", 2), ("picket", 2), ("unionize", 2),
    ("unionization", 2), ("union", 1), ("labor dispute", 2),
    ("contract negotiations", 1), ("names new ceo", 2), ("new ceo", 1),
    ("steps down", 1), ("resigns", 1), ("appoints", 1),
]

INVESTMENT_TERMS = [
    ("raises", 2), ("raised", 1), ("funding round", 3), ("funding", 2),
    ("series a", 3), ("series b", 3), ("series c", 3), ("seed round", 3),
    ("venture capital", 2), ("venture", 1), ("investment", 2),
    ("invests", 2), ("investor", 1), ("acquisition", 2), ("acquires", 2),
    ("acquired", 2), ("merger", 3), ("merges with", 3), ("m&a", 3),
    ("ipo", 2), ("goes public", 2), ("public offering", 2),
    ("private equity", 2), ("grant", 1), ("donation", 1),
    ("bond rating", 2), ("credit rating", 1), ("bankruptcy", 2),
    ("chapter 11", 2), ("divests", 2), ("divestiture", 2), ("financing", 2),
    ("valuation", 1), ("takeover", 2), ("buyout", 2),
]

LIFE_SCIENCE_TERMS = [
    ("biotech", 3), ("biotechnology", 3), ("life sciences", 3),
    ("life science", 3), ("biopharma", 3), ("big pharma", 3),
    ("pharmaceutical", 2), ("pharmaceuticals", 2), ("pharma", 2),
    ("drugmaker", 2), ("drug maker", 2), ("clinical trial", 2),
    ("clinical trials", 2), ("fda approval", 2), ("fda", 1),
    ("vaccine", 2), ("vaccines", 2), ("gene therapy", 2),
    ("cell therapy", 2), ("genomics", 2), ("mrna", 2), ("oncology", 1),
    ("therapeutics", 1), ("medical research", 1), ("research institute", 1),
    ("biomanufacturing", 2), ("medical device", 2), ("medtech", 2),
    ("drug development", 2), ("biosciences", 2),
]

HOSPITAL_TERMS = [
    ("hospital", 2), ("hospitals", 2), ("health system", 3),
    ("health systems", 3), ("medical center", 2), ("healthcare", 2),
    ("health care", 2), ("clinic", 1), ("clinics", 1), ("physician", 1),
    ("physicians", 1), ("primary care", 1), ("urgent care", 1),
    ("nurses", 1), ("nursing", 1), ("emergency room", 1),
    ("emergency department", 1), ("telehealth", 1), ("digital health", 2),
    ("health tech", 2), ("health insurance", 1), ("health plan", 1),
    ("insurer", 1), ("medicaid", 1), ("medicare", 1), ("apple health", 1),
    ("behavioral health", 1), ("mental health", 1), ("psychiatric", 1),
    ("public health", 1), ("hospice", 1), ("home health", 1),
    ("long-term care", 1), ("nursing home", 1), ("assisted living", 1),
    ("senior living", 1), ("skilled nursing", 1), ("cancer center", 1),
    ("medical school", 1), ("patients", 1), ("hospital beds", 2),
    ("maternity", 1), ("birth center", 1), ("dental clinic", 1),
]

# Articles that mention Washington, D.C. need strong WA-state evidence to
# survive; these phrases indicate the OTHER Washington.
DC_TERMS = [
    "washington, d.c.", "washington d.c.", "washington dc",
    "district of columbia", "george washington university",
    "washington commanders", "washington nationals", "washington wizards",
    "washington capitals", "howard university hospital", "medstar",
]

# Crime/accident language: articles where a hospital is only mentioned as
# the place victims were taken. Dropped unless topic relevance is strong.
NOISE_TERMS = [
    "shooting", "stabbing", "crash", "collision", "homicide", "murder",
    "assault", "arrested", "police say", "car accident", "dui",
    "pedestrian struck", "obituary", "obituaries", "sentenced",
    "pleads guilty", "charged with",
]

# ---------------------------------------------------------------------------
# Report categories, in classification-priority order (first wins ties)
# ---------------------------------------------------------------------------

CATEGORY_ORDER = [
    ("medical_office", "Medical Office & Healthcare Real Estate"),
    ("workforce", "Healthcare & Life Sciences Workforce (Layoffs & Hirings)"),
    ("investment", "Healthcare Investments, Funding & M&A"),
    ("life_sciences", "Life Sciences, Biotech & Pharma"),
    ("hospitals", "Hospitals & Health Systems"),
    ("other", "Other Healthcare & Adjacent News"),
]
CATEGORY_TITLES = dict(CATEGORY_ORDER)

# ---------------------------------------------------------------------------
# Google News / Bing News search queries (when: recency added at runtime)
# ---------------------------------------------------------------------------

_REGION_Q = ('("Washington state" OR "Puget Sound" OR Seattle OR Tacoma OR '
             'Bellevue OR Everett OR Spokane OR "King County")')

SEARCH_QUERIES = [
    ("hospitals-health-systems",
     '(hospital OR "health system" OR "medical center" OR healthcare) '
     + _REGION_Q),
    ("healthcare-workforce",
     '(layoffs OR hiring OR "job cuts" OR strike OR union) '
     '(hospital OR healthcare OR nurses OR biotech) ' + _REGION_Q),
    ("healthcare-investment",
     '(healthcare OR hospital OR "health system" OR biotech) '
     '(funding OR investment OR acquisition OR merger OR raises) '
     + _REGION_Q),
    ("medical-office-re",
     '("medical office" OR "medical building" OR "outpatient clinic" OR '
     '"surgery center" OR "medical campus") ' + _REGION_Q),
    ("healthcare-re-trade",
     '("medical office building" OR "healthcare real estate") '
     '("Washington state" OR Seattle OR Tacoma OR Bellevue OR '
     '"Puget Sound" OR Spokane OR Everett)'),
    ("life-sciences",
     '(biotech OR "life sciences" OR pharmaceutical OR biopharma) '
     + _REGION_Q),
    ("clinical-research",
     '("clinical trial" OR FDA OR "drug development" OR vaccine) '
     '(Seattle OR "Washington state" OR "Puget Sound" OR "Fred Hutch")'),
    ("wa-health-systems-1",
     '("UW Medicine" OR "MultiCare" OR "Virginia Mason" OR '
     '"Seattle Children\'s" OR "EvergreenHealth" OR "Overlake" OR '
     '"PeaceHealth" OR "Providence Swedish" OR '
     '"Kaiser Permanente Washington")'),
    ("wa-health-systems-2",
     '("Fred Hutchinson" OR "Fred Hutch" OR "Harborview" OR '
     '"Confluence Health" OR "Kadlec" OR "St. Michael Medical Center" OR '
     '"Tacoma General" OR "Mary Bridge" OR "Providence Sacred Heart")'),
    ("wa-biotech-companies",
     '("Sana Biotechnology" OR "Adaptive Biotechnologies" OR "Seagen" OR '
     '"Absci" OR "Omeros" OR "Nautilus Biotechnology" OR "Athira Pharma" '
     'OR "Truveta" OR "Icosavax" OR "Umoja Biopharma")'),
    ("wa-research-institutions",
     '("Allen Institute" OR "Institute for Systems Biology" OR '
     '"Benaroya Research" OR "Gates Foundation" OR '
     '"Bloodworks Northwest" OR "Washington State Hospital Association")'),
    ("senior-behavioral-care",
     '("senior living" OR "assisted living" OR "skilled nursing" OR '
     '"behavioral health" OR "long-term care") '
     '(Seattle OR Tacoma OR "Washington state" OR "Puget Sound")'),
    ("payers-medicaid",
     '(Premera OR Regence OR "Apple Health" OR Medicaid OR '
     '"health insurance") ("Washington state" OR Seattle OR Olympia OR '
     '"Puget Sound")'),
]

# Direct feeds. region_implied: outlet only covers WA, so geography is
# satisfied. topic_implied: outlet only covers healthcare/biotech, so the
# topic requirement is satisfied (geography still checked, and vice versa).
DIRECT_FEEDS = [
    {"name": "Seattle Times - Business",
     "url": "https://www.seattletimes.com/business/feed/",
     "region_implied": True, "topic_implied": False},
    {"name": "Seattle Times - Health",
     "url": "https://www.seattletimes.com/seattle-news/health/feed/",
     "region_implied": True, "topic_implied": True},
    {"name": "GeekWire",
     "url": "https://www.geekwire.com/feed/",
     "region_implied": True, "topic_implied": False},
    {"name": "Washington State Standard",
     "url": "https://washingtonstatestandard.com/feed/",
     "region_implied": True, "topic_implied": False},
    {"name": "MyNorthwest",
     "url": "https://mynorthwest.com/feed/",
     "region_implied": True, "topic_implied": False},
    {"name": "Axios Seattle",
     "url": "https://api.axios.com/feed/local/seattle",
     "region_implied": True, "topic_implied": False},
    {"name": "STAT News",
     "url": "https://www.statnews.com/feed/",
     "region_implied": False, "topic_implied": True},
    {"name": "Endpoints News",
     "url": "https://endpts.com/feed/",
     "region_implied": False, "topic_implied": True},
    {"name": "Fierce Biotech",
     "url": "https://www.fiercebiotech.com/rss/xml",
     "region_implied": False, "topic_implied": True},
    {"name": "Fierce Healthcare",
     "url": "https://www.fiercehealthcare.com/rss/xml",
     "region_implied": False, "topic_implied": True},
    {"name": "Becker's Hospital Review",
     "url": "https://www.beckershospitalreview.com/feed",
     "region_implied": False, "topic_implied": True},
]


# ---------------------------------------------------------------------------
# Keyword matching
# ---------------------------------------------------------------------------

class KeywordMatcher:
    """Compiles weighted phrases into word-boundary regexes."""

    def __init__(self, terms):
        # terms: iterable of (phrase, weight) or plain phrases (weight 1)
        self._compiled = []
        for term in terms:
            phrase, weight = term if isinstance(term, tuple) else (term, 1)
            body = r"[\s\-]+".join(
                re.escape(word) for word in phrase.split())
            # \b only works next to word characters; phrases that start or
            # end with punctuation (e.g. "washington, d.c.") would never
            # match with an unconditional anchor.
            prefix = r"\b" if re.match(r"\w", phrase) else ""
            suffix = r"\b" if re.search(r"\w$", phrase) else ""
            pattern = prefix + body + suffix
            self._compiled.append(
                (re.compile(pattern, re.IGNORECASE), phrase, weight))

    def match(self, text):
        """Return (total_score, [matched phrases])."""
        score, hits = 0, []
        for regex, phrase, weight in self._compiled:
            if regex.search(text):
                score += weight
                hits.append(phrase)
        return score, hits


MATCHERS = {
    "region": KeywordMatcher(REGION_TERMS),
    "wa_health_orgs": KeywordMatcher([(t, 2) for t in WA_HEALTH_SYSTEM_ORGS]),
    "wa_lifesci_orgs": KeywordMatcher([(t, 2) for t in WA_LIFE_SCIENCE_ORGS]),
    "national_orgs": KeywordMatcher([(t, 1) for t in NATIONAL_HEALTH_ORGS]),
    "medical_office": KeywordMatcher(MEDICAL_OFFICE_TERMS),
    "re_signals": KeywordMatcher(RE_SIGNAL_TERMS),
    "workforce": KeywordMatcher(WORKFORCE_TERMS),
    "investment": KeywordMatcher(INVESTMENT_TERMS),
    "life_sciences": KeywordMatcher(LIFE_SCIENCE_TERMS),
    "hospitals": KeywordMatcher(HOSPITAL_TERMS),
    "dc": KeywordMatcher([(t, 1) for t in DC_TERMS]),
    "noise": KeywordMatcher([(t, 1) for t in NOISE_TERMS]),
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Article:
    title: str
    url: str
    source: str
    published: datetime  # timezone-aware, UTC
    summary: str = ""
    origin: str = ""      # which query/feed produced it
    category: str = "other"
    region_hits: list = field(default_factory=list)
    topic_hits: list = field(default_factory=list)
    score: int = 0

    def to_dict(self, tz=None):
        local = self.published.astimezone(tz) if tz else self.published
        return {
            "title": self.title,
            "url": self.url,
            "source": self.source,
            "published_utc": self.published.astimezone(timezone.utc)
                                 .isoformat(timespec="seconds"),
            "published_local": local.isoformat(timespec="seconds"),
            "summary": self.summary,
            "category": self.category,
            "category_title": CATEGORY_TITLES.get(self.category, "Other"),
            "origin": self.origin,
            "region_hits": self.region_hits,
            "topic_hits": self.topic_hits,
            "score": self.score,
        }


@dataclass
class SourceResult:
    label: str
    url: str
    ok: bool
    items_found: int = 0
    error: str = ""


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------

def build_ssl_context(insecure=False):
    if insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get(
        "REQUESTS_CA_BUNDLE")
    if cafile and os.path.exists(cafile):
        return ssl.create_default_context(cafile=cafile)
    return ssl.create_default_context()


def http_get(url, timeout=DEFAULT_TIMEOUT, ctx=None, retries=2):
    """GET a URL with retries; returns response bytes."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": ("application/rss+xml, application/atom+xml, "
                           "application/xml, text/xml, */*"),
            })
            with urllib.request.urlopen(req, timeout=timeout,
                                        context=ctx) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError,
                TimeoutError, ConnectionError, OSError) as err:
            last_err = err
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise last_err


# ---------------------------------------------------------------------------
# Feed parsing (RSS 2.0 and Atom)
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html(text):
    if not text:
        return ""
    text = _TAG_RE.sub(" ", text)
    text = html_lib.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def parse_date(value):
    """Parse RFC 822 or ISO 8601 date strings to aware-UTC datetimes."""
    if not value:
        return None
    value = value.strip()
    try:
        dt = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        dt = None
    if dt is None:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _local_name(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _child_text(elem, name):
    for child in elem:
        if _local_name(child.tag) == name and child.text:
            return child.text.strip()
    return ""


def parse_feed(data):
    """Parse RSS 2.0 or Atom bytes into a list of raw item dicts."""
    text = data.decode("utf-8-sig", errors="replace").strip()
    root = ET.fromstring(text)
    root_name = _local_name(root.tag).lower()
    items = []

    if root_name == "rss":
        channel = next(
            (c for c in root if _local_name(c.tag) == "channel"), None)
        if channel is None:
            return items
        for item in channel:
            if _local_name(item.tag) != "item":
                continue
            source_name, source_url = "", ""
            for child in item:
                if _local_name(child.tag) == "source":
                    source_name = (child.text or "").strip()
                    source_url = child.get("url", "")
            items.append({
                "title": strip_html(_child_text(item, "title")),
                "link": _child_text(item, "link") or _child_text(item, "guid"),
                "summary": _child_text(item, "description")
                           or _child_text(item, "encoded"),
                "published": parse_date(_child_text(item, "pubDate")
                                        or _child_text(item, "date")),
                "source_name": source_name,
                "source_url": source_url,
            })
    elif root_name == "feed":  # Atom
        for entry in root:
            if _local_name(entry.tag) != "entry":
                continue
            link = ""
            for child in entry:
                if _local_name(child.tag) == "link":
                    href = child.get("href", "")
                    if child.get("rel", "alternate") == "alternate" and href:
                        link = href
                        break
                    link = link or href
            items.append({
                "title": strip_html(_child_text(entry, "title")),
                "link": link,
                "summary": _child_text(entry, "summary")
                           or _child_text(entry, "content"),
                "published": parse_date(_child_text(entry, "published")
                                        or _child_text(entry, "updated")),
                "source_name": "",
                "source_url": "",
            })
    return items


def unwrap_redirect(url):
    """Unwrap Bing News (and similar) redirect links to the original URL."""
    try:
        parsed = urllib.parse.urlparse(url)
        if "bing.com" in parsed.netloc:
            target = urllib.parse.parse_qs(parsed.query).get("url")
            if target:
                return target[0]
    except ValueError:
        pass
    return url


def domain_of(url):
    try:
        netloc = urllib.parse.urlparse(url).netloc.lower()
        return netloc[4:] if netloc.startswith("www.") else netloc
    except ValueError:
        return ""


# ---------------------------------------------------------------------------
# Source URL builders
# ---------------------------------------------------------------------------

def google_news_when(hours):
    if hours < 24:
        return "when:%dh" % max(1, hours)
    days = math.ceil(hours / 24)
    return "when:%dd" % days


def google_news_url(query, hours):
    q = urllib.parse.quote_plus("%s %s" % (query, google_news_when(hours)))
    return ("https://news.google.com/rss/search?q=%s"
            "&hl=en-US&gl=US&ceid=US:en" % q)


def bing_news_url(query):
    return ("https://www.bing.com/news/search?q=%s&format=rss"
            % urllib.parse.quote_plus(query))


# ---------------------------------------------------------------------------
# Scoring / filtering / classification
# ---------------------------------------------------------------------------

def clean_google_title(title, source_name):
    """Google News titles look like 'Headline - Source'; strip the suffix."""
    if source_name and title.endswith(" - " + source_name):
        return title[: -(len(source_name) + 3)].rstrip()
    return title


def evaluate_item(raw, origin, region_implied=False, topic_implied=False,
                  min_region=1):
    """Score a raw feed item; return an Article or (None, reason)."""
    title = raw.get("title") or ""
    if not title:
        return None, "no title"
    source_name = raw.get("source_name") or ""
    title = clean_google_title(title, source_name)
    url = unwrap_redirect(raw.get("link") or "")
    summary = strip_html(raw.get("summary") or "")
    # Google News descriptions repeat the headline plus related links.
    if summary.startswith(title[: max(20, len(title) // 2)]):
        summary = ""
    if len(summary) > 400:
        summary = summary[:397].rstrip() + "..."
    text = "%s %s" % (title, summary)

    # --- geography -------------------------------------------------------
    region_score, region_hits = MATCHERS["region"].match(text)
    for key in ("wa_health_orgs", "wa_lifesci_orgs"):
        s, h = MATCHERS[key].match(text)
        region_score += s
        region_hits += h
    src_domain = domain_of(raw.get("source_url") or url)
    full_src = (raw.get("source_url") or "") + " " + url
    if src_domain in WA_SOURCE_DOMAINS or any(
            sub in full_src for sub in WA_SOURCE_URL_SUBSTRINGS):
        region_score += 2
        region_hits.append("wa-source:" + (src_domain or "unknown"))
    if region_implied:
        region_score += 2
        region_hits.append("regional-feed")
    if region_score < min_region:
        return None, "not Washington/Puget Sound"

    # Washington, D.C. false positives: a D.C. mention needs at least one
    # strong WA signal (a weight-2 city/phrase or an org, score >= 2).
    dc_score, dc_hits = MATCHERS["dc"].match(text)
    if dc_score and region_score < 2:
        return None, "Washington D.C. story (%s)" % ", ".join(dc_hits[:3])

    # --- topic -----------------------------------------------------------
    cat_scores = {}
    topic_hits = []
    for key in ("medical_office", "workforce", "investment",
                "life_sciences", "hospitals"):
        s, h = MATCHERS[key].match(text)
        cat_scores[key] = s
        topic_hits += h
    # Org mentions qualify the topic and nudge the matching category.
    wa_sys_score, wa_sys_hits = MATCHERS["wa_health_orgs"].match(text)
    wa_sci_score, wa_sci_hits = MATCHERS["wa_lifesci_orgs"].match(text)
    nat_score, nat_hits = MATCHERS["national_orgs"].match(text)
    cat_scores["hospitals"] += wa_sys_score + nat_score
    cat_scores["life_sciences"] += wa_sci_score
    topic_hits += wa_sys_hits + wa_sci_hits + nat_hits
    # RE transaction language only counts toward the medical-office bucket
    # when the article already has an explicit medical-office phrase.
    if cat_scores["medical_office"] > 0:
        s, h = MATCHERS["re_signals"].match(text)
        cat_scores["medical_office"] += s
        topic_hits += h

    qualifier_score = (cat_scores["medical_office"]
                       + cat_scores["life_sciences"]
                       + cat_scores["hospitals"])
    if qualifier_score == 0 and not topic_implied:
        return None, "not healthcare-related"
    # Workforce/investment terms only matter on healthcare articles, so on
    # topic-implied feeds without other signals treat them as qualified.
    if qualifier_score == 0:
        cat_scores["hospitals"] = 1

    # Crime/accident stories that merely name a hospital are noise.
    noise_score, noise_hits = MATCHERS["noise"].match(text)
    if noise_score and qualifier_score <= 3:
        return None, "incidental mention (%s)" % ", ".join(noise_hits[:3])

    # --- category (highest score wins; CATEGORY_ORDER breaks ties) -------
    category = "other"
    best = 0
    for key, _title in CATEGORY_ORDER:
        if cat_scores.get(key, 0) > best:
            best = cat_scores[key]
            category = key

    source = source_name or src_domain or domain_of(url) or "unknown"
    return Article(
        title=title,
        url=url,
        source=source,
        published=raw.get("published"),
        summary=summary,
        origin=origin,
        category=category,
        region_hits=sorted(set(region_hits)),
        topic_hits=sorted(set(topic_hits)),
        score=region_score + sum(cat_scores.values()),
    ), None


_PUNCT_RE = re.compile(r"[^\w\s]")


def normalize_title(title):
    return _WS_RE.sub(" ", _PUNCT_RE.sub(" ", title.lower())).strip()


def dedupe(articles):
    """Drop exact URL/title duplicates and near-duplicate headlines."""
    kept = []
    seen_urls, seen_titles, kept_tokens = set(), set(), []
    for art in sorted(articles,
                      key=lambda a: (-a.score, -a.published.timestamp())):
        norm = normalize_title(art.title)
        url_key = art.url.split("#")[0].rstrip("/")
        if url_key and url_key in seen_urls:
            continue
        if norm in seen_titles:
            continue
        tokens = set(norm.split())
        is_dup = False
        for other in kept_tokens:
            union = tokens | other
            if union and len(tokens & other) / len(union) >= 0.8:
                is_dup = True
                break
        if is_dup:
            continue
        seen_urls.add(url_key)
        seen_titles.add(norm)
        kept_tokens.append(tokens)
        kept.append(art)
    return kept


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def pacific_tz():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("America/Los_Angeles")
    except Exception:  # tzdata missing; fall back to fixed PDT offset
        return timezone(timedelta(hours=-7), name="PT")


def relative_age(published, now):
    delta = now - published
    minutes = int(delta.total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return "%d min ago" % minutes
    hours = minutes // 60
    if hours < 48:
        return "%d hr ago" % hours
    return "%d days ago" % (hours // 24)


def group_by_category(articles, max_per_category):
    grouped = {}
    for art in articles:
        grouped.setdefault(art.category, []).append(art)
    result = []
    for key, title in CATEGORY_ORDER:
        arts = grouped.get(key, [])
        arts.sort(key=lambda a: a.published, reverse=True)
        if arts:
            result.append((key, title, arts[:max_per_category]))
    return result


def render_markdown(grouped, meta):
    lines = [
        "# Washington State & Puget Sound Healthcare News",
        "",
        "**Window:** past %d hours (since %s)  " % (
            meta["hours"], meta["since_local"]),
        "**Generated:** %s  " % meta["generated_local"],
        "**Articles:** %d kept from %d fetched, %d/%d sources responded" % (
            meta["kept"], meta["fetched"],
            meta["sources_ok"], meta["sources_total"]),
        "",
    ]
    if not grouped:
        lines.append("_No matching articles found in this window._")
    for _key, title, arts in grouped:
        lines.append("## %s (%d)" % (title, len(arts)))
        lines.append("")
        for art in arts:
            local = art.published.astimezone(meta["tz"])
            when = "%s (%s)" % (local.strftime("%a %b %d, %I:%M %p %Z"),
                                relative_age(art.published, meta["now"]))
            lines.append("- **[%s](%s)**  " % (art.title, art.url))
            lines.append("  %s · %s  " % (art.source, when))
            if art.summary:
                lines.append("  %s" % art.summary)
        lines.append("")
    failures = [s for s in meta["source_results"] if not s.ok]
    if failures:
        lines.append("---")
        lines.append("**Sources that failed:** " + "; ".join(
            "%s (%s)" % (s.label, s.error) for s in failures))
        lines.append("")
    return "\n".join(lines)


_HTML_CSS = """
:root { --green:#003F2D; --accent:#17E88F; --ink:#1a1a1a; --muted:#5f6b66;
        --bg:#f4f6f5; --card:#ffffff; --line:#dfe5e2; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,
       sans-serif; color:var(--ink); background:var(--bg); padding:24px; }
.wrap { max-width:860px; margin:0 auto; }
header { background:var(--green); color:#fff; border-radius:10px;
         padding:22px 26px; margin-bottom:22px; }
header h1 { font-size:21px; font-weight:700; }
header .sub { color:#cfe8dd; font-size:13px; margin-top:6px; }
header .sub b { color:var(--accent); font-weight:600; }
section { margin-bottom:26px; }
h2 { font-size:16px; color:var(--green); border-bottom:2px solid
     var(--accent); padding-bottom:6px; margin-bottom:12px; }
h2 .count { background:var(--green); color:#fff; border-radius:10px;
            font-size:11px; padding:2px 9px; vertical-align:2px;
            margin-left:8px; }
.card { background:var(--card); border:1px solid var(--line);
        border-left:4px solid var(--accent); border-radius:8px;
        padding:13px 16px; margin-bottom:10px; }
.card a.title { color:var(--green); font-weight:600; font-size:15px;
                text-decoration:none; }
.card a.title:hover { text-decoration:underline; }
.meta { color:var(--muted); font-size:12.5px; margin-top:4px; }
.meta .src { background:#e7f2ec; color:var(--green); border-radius:8px;
             padding:1px 8px; margin-right:8px; font-weight:600; }
.summary { font-size:13.5px; margin-top:7px; color:#333; }
.empty { background:var(--card); border:1px dashed var(--line);
         border-radius:8px; padding:24px; text-align:center;
         color:var(--muted); }
footer { color:var(--muted); font-size:12px; margin-top:26px; }
details { margin-top:8px; }
details summary { cursor:pointer; }
@media print { body { background:#fff; padding:0; }
               .card { break-inside:avoid; } }
"""


def render_html(grouped, meta):
    esc = html_lib.escape
    parts = [
        "<!DOCTYPE html>",
        '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>WA Healthcare News — %s</title>" % esc(meta["date_label"]),
        "<style>%s</style></head><body><div class='wrap'>" % _HTML_CSS,
        "<header><h1>Washington State &amp; Puget Sound Healthcare News</h1>",
        "<div class='sub'>Past <b>%d hours</b> · generated %s · "
        "<b>%d</b> articles · %d/%d sources responded</div></header>" % (
            meta["hours"], esc(meta["generated_local"]), meta["kept"],
            meta["sources_ok"], meta["sources_total"]),
    ]
    if not grouped:
        parts.append("<div class='empty'>No matching articles were found "
                     "in this window. Try a longer --hours window.</div>")
    for _key, title, arts in grouped:
        parts.append("<section><h2>%s<span class='count'>%d</span></h2>" % (
            esc(title), len(arts)))
        for art in arts:
            local = art.published.astimezone(meta["tz"])
            when = "%s · %s" % (local.strftime("%a %b %d, %I:%M %p %Z"),
                                relative_age(art.published, meta["now"]))
            parts.append("<div class='card'>")
            parts.append("<a class='title' href='%s' target='_blank' "
                         "rel='noopener'>%s</a>" % (
                             esc(art.url, quote=True), esc(art.title)))
            parts.append("<div class='meta'><span class='src'>%s</span>"
                         "%s</div>" % (esc(art.source), esc(when)))
            if art.summary:
                parts.append("<div class='summary'>%s</div>"
                             % esc(art.summary))
            parts.append("</div>")
        parts.append("</section>")
    failures = [s for s in meta["source_results"] if not s.ok]
    parts.append("<footer>Generated by wa_healthcare_news_scraper.py v%s."
                 % VERSION)
    if failures:
        parts.append("<details><summary>%d source(s) failed</summary><ul>"
                     % len(failures))
        for s in failures:
            parts.append("<li>%s — %s</li>" % (esc(s.label), esc(s.error)))
        parts.append("</ul></details>")
    parts.append("</footer></div></body></html>")
    return "\n".join(parts)


def render_json(articles, meta):
    return json.dumps({
        "generated_utc": meta["now"].isoformat(timespec="seconds"),
        "window_hours": meta["hours"],
        "article_count": meta["kept"],
        "articles": [a.to_dict(meta["tz"]) for a in articles],
        "sources": [{
            "label": s.label, "url": s.url, "ok": s.ok,
            "items_found": s.items_found, "error": s.error,
        } for s in meta["source_results"]],
    }, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def build_source_list(args):
    """Return [(label, url, region_implied, topic_implied)] to fetch."""
    sources = []
    engines = {e.strip().lower() for e in args.engines.split(",") if e.strip()}
    queries = list(SEARCH_QUERIES)
    for i, extra in enumerate(args.extra_query or [], 1):
        queries.append(("extra-%d" % i, extra))
    if "google" in engines:
        for label, query in queries:
            sources.append(("google:" + label,
                            google_news_url(query, args.hours),
                            False, False))
    if "bing" in engines:
        for label, query in queries:
            sources.append(("bing:" + label, bing_news_url(query),
                            False, False))
    if not args.skip_direct_feeds:
        for feed in DIRECT_FEEDS:
            sources.append(("feed:" + feed["name"], feed["url"],
                            feed["region_implied"], feed["topic_implied"]))
    return sources


def run(args, fetcher=http_get):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=args.hours)
    tz = pacific_tz()
    ctx = build_ssl_context(insecure=args.insecure)

    sources = build_source_list(args)
    source_results = []
    candidates = []
    fetched_count = 0
    drop_reasons = {}

    for label, url, region_implied, topic_implied in sources:
        if args.verbose:
            print("  fetching %-38s %s" % (label, url[:90]))
        try:
            data = fetcher(url, timeout=args.timeout, ctx=ctx)
            raw_items = parse_feed(data)
        except ET.ParseError as err:
            source_results.append(SourceResult(label, url, False,
                                               error="bad XML: %s" % err))
            continue
        except Exception as err:  # network errors of any flavor
            source_results.append(SourceResult(
                label, url, False,
                error="%s: %s" % (type(err).__name__, str(err)[:120])))
            continue
        source_results.append(SourceResult(label, url, True,
                                           items_found=len(raw_items)))
        fetched_count += len(raw_items)
        for raw in raw_items:
            published = raw.get("published")
            if published is None:
                drop_reasons["undated"] = drop_reasons.get("undated", 0) + 1
                continue
            if published < cutoff or published > now + timedelta(hours=2):
                drop_reasons["outside window"] = \
                    drop_reasons.get("outside window", 0) + 1
                continue
            article, reason = evaluate_item(
                raw, origin=label, region_implied=region_implied,
                topic_implied=topic_implied, min_region=args.min_region)
            if article is None:
                key = reason.split(" (")[0]
                drop_reasons[key] = drop_reasons.get(key, 0) + 1
                continue
            candidates.append(article)
        if args.delay > 0:
            time.sleep(args.delay)

    articles = dedupe(candidates)
    drop_reasons["duplicate"] = len(candidates) - len(articles)
    grouped = group_by_category(articles, args.max_per_category)
    kept = sum(len(arts) for _k, _t, arts in grouped)

    meta = {
        "now": now,
        "tz": tz,
        "hours": args.hours,
        "since_local": cutoff.astimezone(tz).strftime("%a %b %d, %I:%M %p %Z"),
        "generated_local": now.astimezone(tz).strftime(
            "%a %b %d %Y, %I:%M %p %Z"),
        "date_label": now.astimezone(tz).strftime("%b %d, %Y"),
        "kept": kept,
        "fetched": fetched_count,
        "sources_ok": sum(1 for s in source_results if s.ok),
        "sources_total": len(source_results),
        "source_results": source_results,
        "drop_reasons": drop_reasons,
    }
    flat = [a for _k, _t, arts in grouped for a in arts]
    return grouped, flat, meta


def write_reports(grouped, flat, meta, args):
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = meta["now"].astimezone(meta["tz"]).strftime("%Y%m%d_%H%M")
    formats = {f.strip().lower() for f in args.formats.split(",") if f.strip()}
    written = []
    renders = {
        "md": lambda: render_markdown(grouped, meta),
        "html": lambda: render_html(grouped, meta),
        "json": lambda: render_json(flat, meta),
    }
    for fmt, render in renders.items():
        if fmt not in formats:
            continue
        path = out_dir / ("wa_healthcare_news_%s.%s" % (stamp, fmt))
        path.write_text(render(), encoding="utf-8")
        written.append(path)
    return written


def print_summary(grouped, meta, written, args):
    print("")
    print("WA / Puget Sound Healthcare News Scraper v%s" % VERSION)
    print("Window: past %d hours (since %s)" % (
        meta["hours"], meta["since_local"]))
    print("Sources: %d of %d responded; %d raw items fetched" % (
        meta["sources_ok"], meta["sources_total"], meta["fetched"]))
    failures = [s for s in meta["source_results"] if not s.ok]
    if failures:
        for s in failures:
            print("  [failed] %s: %s" % (s.label, s.error))
    print("Kept %d article(s) after filtering and dedupe:" % meta["kept"])
    for _key, title, arts in grouped:
        print("  %-58s %3d" % (title, len(arts)))
    if args.verbose and meta["drop_reasons"]:
        print("Dropped:")
        for reason, count in sorted(meta["drop_reasons"].items()):
            print("  %-32s %5d" % (reason, count))
    if written:
        print("Reports written:")
        for path in written:
            print("  %s" % path)
    print("")


def list_sources(args):
    print("Google News / Bing queries (recency operator added at runtime):")
    for label, query in SEARCH_QUERIES:
        print("  %-26s %s" % (label, query))
    print("\nDirect feeds:")
    for feed in DIRECT_FEEDS:
        flags = []
        if feed["region_implied"]:
            flags.append("region-implied")
        if feed["topic_implied"]:
            flags.append("topic-implied")
        print("  %-28s %s (%s)" % (
            feed["name"], feed["url"], ", ".join(flags) or "-"))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description=("Scrape the past 24 hours of Washington State / "
                     "Puget Sound healthcare, medical office, and life "
                     "sciences news into Markdown/HTML/JSON reports."))
    parser.add_argument("--hours", type=int, default=DEFAULT_HOURS,
                        help="lookback window in hours (default: 24)")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                        help="directory for reports (default: news_reports)")
    parser.add_argument("--formats", default="md,html,json",
                        help="comma list of md,html,json (default: all)")
    parser.add_argument("--engines", default="google",
                        help="comma list of search engines to query: "
                             "google,bing (default: google)")
    parser.add_argument("--skip-direct-feeds", action="store_true",
                        help="skip the curated direct RSS feeds")
    parser.add_argument("--extra-query", action="append", metavar="QUERY",
                        help="additional search query (repeatable)")
    parser.add_argument("--max-per-category", type=int, default=25,
                        help="cap articles per category (default: 25)")
    parser.add_argument("--min-region", type=int, default=1,
                        help="minimum geography score to keep (default: 1)")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT,
                        help="per-request timeout seconds (default: 20)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY,
                        help="pause between requests (default: 0.4s)")
    parser.add_argument("--insecure", action="store_true",
                        help="skip TLS certificate verification (only for "
                             "corporate proxies that intercept TLS)")
    parser.add_argument("--list-sources", action="store_true",
                        help="print the queries and feeds, then exit")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="log each fetch and drop-reason counts")
    parser.add_argument("--version", action="version",
                        version="%(prog)s " + VERSION)
    return parser.parse_args(argv)


def main(argv=None):
    if sys.version_info < (3, 9):
        print("This script requires Python 3.9 or newer.", file=sys.stderr)
        return 2
    args = parse_args(argv)
    if args.list_sources:
        list_sources(args)
        return 0
    if args.insecure:
        print("WARNING: TLS certificate verification is DISABLED.",
              file=sys.stderr)
    print("Searching %d-hour window for WA/Puget Sound healthcare news..."
          % args.hours)
    grouped, flat, meta = run(args)
    written = write_reports(grouped, flat, meta, args)
    print_summary(grouped, meta, written, args)
    if meta["sources_ok"] == 0:
        print("ERROR: every source failed -- check network/proxy settings "
              "(try --insecure if behind a TLS-intercepting proxy).",
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
