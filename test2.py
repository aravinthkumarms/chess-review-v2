import re

with open('src/app/result/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

div_count = 0
for i, line in enumerate(lines):
    if '{/*' in line or '*/}' in line:
        continue
    if '//' in line:
        pass
    
    opens = len(re.findall(r'<div\b[^>]*>', line))
    closes = len(re.findall(r'</div>', line))
    self_closes = len(re.findall(r'<div\b[^>]*/>', line))
    
    div_count += (opens - self_closes - closes)
    if opens > 0 or closes > 0:
        print(f"Line {i+1} [Balance: {div_count}]: {line.strip()}")

print(f"Final Balance: {div_count}")
