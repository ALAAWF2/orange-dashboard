import json

with open('allorangedashboard/ceo_data/products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data.get('products', {})
with open('allorangedashboard/scratch/first_five_products.txt', 'w', encoding='utf-8') as f:
    f.write(f"Keys of products.json: {list(data.keys())}\n")
    f.write(f"Number of products: {len(products)}\n")
    first_five = list(products.items())[:20]
    for k, v in first_five:
        f.write(f"Key: {k} | Value: {v}\n")

print("Done! Check allorangedashboard/scratch/first_five_products.txt")
