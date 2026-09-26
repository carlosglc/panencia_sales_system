-- Menú inicial con precios de venta. Los costos se capturan en el panel (no van al repo).
INSERT INTO products (id, name, category, price_cents, unit, aliases, sort) VALUES
  ('hogaza-natural',       'Hogaza Natural',               'pan',       8500,  NULL, '["hogaza sola","hogaza clasica","hogaza normal"]', 1),
  ('hogaza-hierbas',       'Hogaza Hierbas',               'pan',       9500,  NULL, '["hogaza de hierbas","hogaza hierbas italianas","hierbas finas"]', 2),
  ('hogaza-ajo-parm',      'Hogaza Ajo y Parmesano',       'pan',       14500, NULL, '["hogaza ajo parm","hogaza de ajo","hogaza parmesano"]', 3),
  ('molde-honey',          'Pan de Molde',                 'pan',       9000,  NULL, '["pan de caja","pan molde miel","honey"]', 4),
  ('molde-ajo-parm',       'Pan de Molde Ajo y Parmesano', 'pan',       9500,  NULL, '["pan de caja ajo","molde ajo parm"]', 5),
  ('molde-hierbas',        'Pan de Molde Hierbas',         'pan',       9500,  NULL, '["pan de caja hierbas","molde hierbas italianas"]', 6),
  ('apple-pie',            'Apple Pie',                    'postres',   30000, NULL, '["pay de manzana","pie de manzana","pay manzana"]', 10),
  ('galleta-chocochips',   'Galleta Chocochips',           'postres',   5500,  NULL, '["galleta chocochip","galleta chispas","galleta de chocolate"]', 11),
  ('galleta-brownie',      'Galleta Brownie',              'postres',   5500,  NULL, '["chocobrownie","galleta chocobrownie"]', 12),
  ('galleta-limon',        'Galleta Pay de Limón',         'postres',   5500,  NULL, '["galleta limon","galleta de limon"]', 13),
  ('croissant-4',          'Croissant (4 pz)',             'laminados', 15000, 'caja de 4', '["croissant","cruasan"]', 20),
  ('chocolatin-4',         'Chocolatín (4 pz)',            'laminados', 18000, 'caja de 4', '["chocolatin","pain au chocolat"]', 21),
  ('pan-muerto-charola-8', 'Pan de Muerto charola (8 ch)', 'temporada', 30000, '8 chicos', '["charola pan de muerto","pan de muerto chico","pan de muerto charola"]', 30),
  ('pan-muerto-grande',    'Pan de Muerto grande',         'temporada', 5500,  NULL, '["pan de muerto grande","pan de muerto"]', 31);

INSERT INTO settings (key, value) VALUES ('payment_note', '');
