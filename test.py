import urllib.request, json
pgn = """[Event "Rated Blitz game"]
[White "Magnus"]
[Black "Hikaru"]
[WhiteElo "2850"]
[BlackElo "2820"]
[TimeControl "180+2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6"""

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/py/analyze',
    data=json.dumps({'pgn': pgn, 'depth': 10}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
res = urllib.request.urlopen(req)
print([m['classification'] for m in json.loads(res.read())['moves']])
