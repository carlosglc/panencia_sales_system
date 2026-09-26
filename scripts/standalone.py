"""Envuelve app/pedidos.html en un documento HTML completo para publicarlo fuera de Claude.

Fuera de Claude la página no tiene la base de datos compartida: guarda los pedidos en el
navegador de quien la abre (localStorage) y arranca con el menú de data/menu-seed.json.

Uso: python3 scripts/standalone.py <archivo de salida>
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
body = (ROOT / "app" / "pedidos.html").read_text(encoding="utf-8")
head_end = body.index("</style>") + len("</style>")
head, content = body[:head_end], body[head_end:]
doc = (
    "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n"
    "<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
    "<meta name=\"description\" content=\"Registro de pedidos de Panencia: crea la orden, mándala por WhatsApp, marca pagos y ve la lista de horneado de la semana.\">\n"
    + head + "\n</head>\n<body>" + content + "\n</body>\n</html>\n"
)
out = pathlib.Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(doc, encoding="utf-8")
print(f"Escrito {out}")
