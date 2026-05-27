const fs = require('fs');

// Load products and categories map
const prodData = JSON.parse(fs.readFileSync('allorangedashboard/ceo_data/products.json', 'utf8'));
const categoriesMap = JSON.parse(fs.readFileSync('allorangedashboard/categories_map.json', 'utf8'));

const products = prodData.products;

// Inject categoriesMap Cache
const categoriesMapCache = categoriesMap;

function getSuggestedCategory(pidOrAlias, price, productName) {
    if (!pidOrAlias) return null;
    const cleanPid = String(pidOrAlias).trim().replace(/^KIT-/, '');
    const priceVal = price ? Math.round(price) : null;
    const priceStr = priceVal ? String(priceVal) : '';
    
    // Step 1: Search for prefixes of pidOrAlias (length from cleanPid.length - 1 down to 3)
    for (let len = cleanPid.length - 1; len >= 3; len--) {
        const prefix = cleanPid.substring(0, len);
        
        // Find all classified items starting with this prefix in their clean code
        const matches = Object.entries(categoriesMapCache).filter(([code, cat]) => {
            const cleanCode = code.trim().replace(/^KIT-/, '');
            return cleanCode.startsWith(prefix) && cat && cat !== 'غير مصنف';
        });
        
        if (matches.length > 0) {
            // Match Type A: Prefix + Exact Price
            if (priceStr) {
                const priceMatch = matches.find(([_, cat]) => {
                    const reg = new RegExp('\\b' + priceStr + '\\b|-' + priceStr + '\\b');
                    return reg.test(cat) || cat.includes(priceStr);
                });
                if (priceMatch) {
                    return {
                        category: priceMatch[1],
                        prefix: prefix,
                        matchType: 'tree_price'
                    };
                }
            }
            
            // Match Type B: Higher-Level Tree + Price Match
            if (priceStr) {
                for (const [_, catName] of matches) {
                    const parts = catName.split('-');
                    if (parts.length > 1) {
                        const baseName = parts.slice(0, -1).join('-').trim();
                        
                        // Search entire categoriesMapCache for a category starting with baseName and containing priceStr
                        const equivalentCat = Object.values(categoriesMapCache).find(c => {
                            return c.startsWith(baseName) && (c.includes(priceStr) || new RegExp('\\b' + priceStr + '\\b').test(c)) && c !== 'غير مصنف';
                        });
                        if (equivalentCat) {
                            return {
                                category: equivalentCat,
                                prefix: prefix,
                                matchType: 'tree_price_equivalent'
                            };
                        }
                    }
                }
            }
            
            // Match Type C: Fallback to most common sibling category
            const freqs = {};
            let maxFreq = 0;
            let mostCommonCat = matches[0][1];
            matches.forEach(([_, cat]) => {
                freqs[cat] = (freqs[cat] || 0) + 1;
                if (freqs[cat] > maxFreq) {
                    maxFreq = freqs[cat];
                    mostCommonCat = cat;
                }
            });
            
            return {
                category: mostCommonCat,
                prefix: prefix,
                matchType: 'tree_only'
            };
        }
    }
    
    // Step 2: Semantic Matching based on product name keywords + price
    if (productName && priceStr) {
        const name = productName.toLowerCase();
        const keywords = [
            { keys: ['بحر', 'شاطئ'], base: 'مناشف بحر' },
            { keys: ['حمام', 'استحمام'], base: 'مناشف حمام' },
            { keys: ['مطبخ', 'طاول'], base: 'مناشف مطبخ' },
            { keys: ['مطرز'], base: 'مناشف مطرز' },
            { keys: ['روب', 'ارواب', 'أرواب'], base: 'أرواب حمام' },
            { keys: ['لحاف', 'كويلت', 'كينغ', 'كينج'], base: 'لحافات كينغ' },
            { keys: ['لحاف', 'كويلت', 'مفرد', 'نفر', 'فل'], base: 'لحافات فل' }
        ];
        
        for (const kw of keywords) {
            const matchKeyword = kw.keys.some(k => name.includes(k));
            if (matchKeyword) {
                const matchingCat = Object.values(categoriesMapCache).find(c => {
                    return c.toLowerCase().includes(kw.base.toLowerCase()) && c.includes(priceStr) && c !== 'غير مصنف';
                });
                if (matchingCat) {
                    return {
                        category: matchingCat,
                        prefix: 'اسم المنتج',
                        matchType: 'name_price'
                    };
                }
            }
        }
    }
    
    return null;
}

// Let's run a test for specific custom towels:
console.log("Testing towel suggestions specifically:");
const testTowel1 = { alias: '714250', name: 'منشفة بحر رائعة', price: 49 };
const testTowel2 = { alias: '714299', name: 'منشفة بحر ممتازة', price: 59 };
const testTowel3 = { alias: '714902', name: 'منشفة بحر جديدة', price: 39 };
const testTowel4 = { alias: '716099', name: 'منشفة حمام فاخرة', price: 59 };
const testTowel5 = { alias: '999999', name: 'روب استحمام للأطفال', price: 99 };

const tests = [testTowel1, testTowel2, testTowel3, testTowel4, testTowel5];
for (const t of tests) {
    const sug = getSuggestedCategory(t.alias, t.price, t.name);
    console.log(`Input Alias: ${t.alias} | Name: ${t.name} | Price: ${t.price}`);
    if (sug) {
        console.log(`   --> Result: ${sug.category} (matchType: ${sug.matchType}, prefix: ${sug.prefix})`);
    } else {
        console.log(`   --> Result: No Suggestion Found`);
    }
    console.log('--------------------------------------------------');
}
