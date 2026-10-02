# -*- coding: utf-8 -*-
"""Tell Bing and Yandex which pages changed, the moment they change.

Google finds new pages on its own schedule; Bing and Yandex accept a push.
That matters beyond those two engines — ChatGPT's search answers are built
on Bing's index, so a page Bing has not seen cannot be quoted in an answer.

Run after a push: it reads the HTML files that changed in the last commit,
turns them into URLs and submits them. No account and no key exchange —
IndexNow verifies ownership by fetching the key file from the site root.

    python3 scripts/indexnow.py            # last commit
    python3 scripts/indexnow.py <sha>      # since that commit
"""
import glob, json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "hotelagava.ge"
ENDPOINT = "https://api.indexnow.org/indexnow"
os.chdir(ROOT)

keys = [os.path.basename(p)[:-4] for p in glob.glob("*.txt")
        if re.fullmatch(r"[0-9a-f]{16,128}\.txt", os.path.basename(p))]
if not keys:
    print("  ❌ IndexNow-ის გასაღების ფაილი არ არის")
    sys.exit(1)
KEY = keys[0]


def changed(since):
    out = subprocess.run(["git", "diff", "--name-only", since, "HEAD"],
                         capture_output=True, text=True).stdout.split()
    return [f for f in out if f.endswith(".html") and os.path.exists(f)]


def url_of(f):
    return f"https://{SITE}/" + re.sub(r"index\.html$", "", f)


def main():
    since = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
    files = changed(since)
    urls = []
    for f in files:
        if os.path.basename(f) in ("admin.html", "manage.html", "404.html"):
            continue
        h = open(f, encoding="utf-8", errors="ignore").read()
        if re.search(r'name="robots"[^>]*noindex', h):
            continue
        urls.append(url_of(f))
    if not urls:
        print("  ℹ️  შესაცვლელი გვერდი არ არის — არაფერი გაიგზავნა")
        return 0
    body = json.dumps({"host": SITE, "key": KEY,
                       "keyLocation": f"https://{SITE}/{KEY}.txt",
                       "urlList": urls[:10000]}).encode()
    req = urllib.request.Request(ENDPOINT, data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"  ✅ IndexNow {r.status} · {len(urls)} მისამართი")
    except Exception as e:
        # never fail the build over this; the sitemap still covers the pages
        print(f"  ⚠️  IndexNow ვერ გაიგზავნა: {e}")
    for u in urls[:10]:
        print(f"      · {u}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
