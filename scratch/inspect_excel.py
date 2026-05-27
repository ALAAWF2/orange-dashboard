import pandas as pd
import json

df = pd.read_excel('new cate ceo.xlsx')
df['CODE'] = df['CODE'].astype(str).str.replace(r'\.0$', '', regex=True)
df['CATEGORY'] = df['CATEGORY'].fillna('غير مصنف')

# Print categories containing beach or towels, writing to a file with utf-8 encoding
matches = df[df['CATEGORY'].astype(str).str.contains('بحر|منشفة|فوط|مناشف|towel', case=False, na=False)]

with open('allorangedashboard/scratch/matching_cats.txt', 'w', encoding='utf-8') as f:
    for idx, row in matches.iterrows():
        f.write(f"CODE: {row['CODE']} | CATEGORY: {row['CATEGORY']}\n")

print(f"Done! Written {len(matches)} matching rows to allorangedashboard/scratch/matching_cats.txt")
