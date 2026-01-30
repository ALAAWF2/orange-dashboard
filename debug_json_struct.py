
import json
import sys

try:
    with open('product_analysis_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    with open('debug_result.txt', 'w', encoding='utf-8') as out:
        out.write(f"Keys: {list(data.keys())}\n")
        if 'periods' in data:
            out.write(f"Periods: {list(data['periods'].keys())}\n")
            if 'yest' in data['periods']:
                yest = data['periods']['yest']
                out.write(f"Yest Keys: {list(yest.keys())}\n")
                if 'catalog' in yest:
                    cat = yest['catalog']
                    out.write(f"Catalog Categories: {[repr(k) for k in list(cat.keys())[:5]]}\n")
                    first_cat = list(cat.keys())[0]
                    items = cat[first_cat]
                    out.write(f"Items in {first_cat}: {len(items)}\n")
                    if items:
                        out.write(f"Sample Item: {items[0]}\n")
                else:
                    out.write("No catalog in yest\n")
            else:
                out.write("No yest period\n")
        else:
            out.write("No periods\n")

except Exception as e:
    print(e)
