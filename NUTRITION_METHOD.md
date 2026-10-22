# Approximate nutrition in the local demo

CraveCode's dish ranges are **illustrative hypotheses**, not measured values for a Swiggy item. Each supported dish name maps to a broad single-serving calorie and protein range. The ranges are hand authored to include plausible changes in portion size, oil, sauces, and preparation. Their ingredient background is the [ICMR-NIN Indian Food Composition Tables](https://www.nin.res.in/ebooks/IFCT2017.pdf); no table values are copied into the app, and the linked table does not validate a particular restaurant recipe.

The matcher uses the item name only. It avoids applying a simple dish profile to a composite food such as a pizza, biryani, or sandwich. When the name is ambiguous or unsupported, the estimate remains unknown. An estimate can be labeled **possible** if its calorie lower bound is within the requested maximum and its protein upper bound reaches the requested minimum; otherwise it is **unlikely**. Neither verdict is an exact macro match. The app never calls it documented restaurant nutrition.

Before any estimate is used as more than a browsing aid, collect a measured or restaurant-published serving size and recipe, calibrate the range against it, and record coverage and error on a fixed sample. A suitable source must match the exact restaurant, item, variant, and portion. The local demo currently has no such verified sources.
