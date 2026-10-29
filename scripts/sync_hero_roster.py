"""Refresh review-only hero identities and portraits. Never changes combat formulas."""
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = 'https://api.deadlock-api.com/v1/assets/heroes?language=english'


def download(url, maximum=4 * 1024 * 1024):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'DeadlockBuildCreator'}), timeout=30) as response:
        data = response.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError('Asset too large')
        return data


def main():
    raw = download(SOURCE)
    heroes = json.loads(raw)
    folder = ROOT / 'public/assets/heroes'
    folder.mkdir(parents=True, exist_ok=True)

    def extract(hero):
        record = {'id': hero['id'], 'name': hero['name'], 'className': hero['class_name']}
        url = hero.get('images', {}).get('icon_image_small')
        if url and url.startswith('https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/'):
            try:
                data = download(url)
                if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('Expected PNG')
                path = folder / f"{hero['id']}.png"
                path.write_bytes(data)
                record['portrait'] = f"/assets/heroes/{hero['id']}.png"
                return record, {'path': str(path.relative_to(ROOT)), 'source': url, 'sha256': hashlib.sha256(data).hexdigest()}
            except Exception as error:
                print(f"Portrait unavailable for hero {hero['id']}: {error}")
        return record, None

    records = list(concurrent.futures.ThreadPoolExecutor(max_workers=8).map(extract, heroes))
    output = {'source': SOURCE, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'heroes': sorted([r for r, _ in records], key=lambda h: h['id'])}
    (ROOT / 'src/data/heroRoster.json').write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
    (folder / 'provenance.json').write_text(json.dumps({'source': SOURCE, 'retrievedAt': output['retrievedAt'], 'files': [f for _, f in records if f]}, indent=2) + '\n')
    print(f"{len(records)} hero identities, {len([f for _, f in records if f])} portraits")


if __name__ == '__main__':
    main()
