"""PDF do certificado (WeasyPrint) com QR code para a página pública de verificação."""

from __future__ import annotations

import base64
import io
from datetime import datetime

import qrcode
from weasyprint import HTML

from ..config import get_settings
from ..models import Certificate

TEMPLATE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado {code}</title>
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: "DejaVu Sans", sans-serif; color: #0a1220;
          background: #f4f8ff; }}
  .sheet {{ position: relative; width: 297mm; height: 210mm; padding: 18mm 20mm;
            background: #f4f8ff; overflow: hidden; }}
  .frame {{ position: absolute; inset: 8mm; border: 1.2mm solid #0d2a4a; border-radius: 3mm; }}
  .frame::after {{ content: ""; position: absolute; inset: 2.2mm; border: 0.3mm solid #39d0ff; border-radius: 2mm; }}
  .glow {{ position: absolute; width: 120mm; height: 120mm; border-radius: 50%;
           background: #39d0ff; opacity: 0.09; top: -45mm; right: -35mm; }}
  .glow.two {{ background: #3dff8a; top: auto; right: auto; bottom: -55mm; left: -40mm; }}
  .inner {{ position: relative; height: 100%; display: flex; flex-direction: column; }}
  header {{ display: flex; justify-content: space-between; align-items: flex-start; }}
  .brand {{ font-size: 7mm; letter-spacing: 1.6mm; font-weight: bold; color: #0d2a4a; }}
  .brand small {{ display: block; font-size: 2.6mm; letter-spacing: 0.7mm; color: #3a5878; font-weight: normal; margin-top: 1mm; }}
  .kind {{ text-align: right; font-size: 3mm; letter-spacing: 0.9mm; color: #3a5878; text-transform: uppercase; }}
  h1 {{ font-size: 9mm; margin: 12mm 0 2mm; letter-spacing: 0.4mm; }}
  .lead {{ font-size: 3.6mm; color: #3a5878; margin: 0; }}
  .holder {{ font-size: 12mm; margin: 7mm 0 3mm; color: #0d2a4a; border-bottom: 0.5mm solid #cfe0f5;
             padding-bottom: 3mm; }}
  .body {{ font-size: 3.8mm; line-height: 1.55; max-width: 175mm; color: #22354d; }}
  .modules {{ margin: 6mm 0 0; padding: 0; list-style: none; columns: 2; column-gap: 8mm; font-size: 3.2mm; }}
  .modules li {{ margin-bottom: 1.6mm; }}
  .modules li::before {{ content: "▸ "; color: #0b7d5a; }}
  footer {{ margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }}
  .meta {{ font-size: 3mm; color: #3a5878; line-height: 1.6; }}
  .meta strong {{ color: #0d2a4a; }}
  .code {{ font-family: "DejaVu Sans Mono", monospace; font-size: 4.4mm; letter-spacing: 0.6mm; color: #0d2a4a; }}
  .qr {{ text-align: center; font-size: 2.5mm; color: #3a5878; }}
  .qr img {{ width: 30mm; height: 30mm; display: block; }}
  .sign {{ text-align: right; font-size: 2.8mm; color: #3a5878; }}
  .sign .line {{ width: 60mm; border-top: 0.3mm solid #0d2a4a; margin: 0 0 1.5mm auto; }}
  .disclaimer {{ position: absolute; bottom: 4mm; left: 0; right: 0; text-align: center;
                 font-size: 2.4mm; color: #7a8ea8; }}
</style></head>
<body><div class="sheet">
  <div class="glow"></div><div class="glow two"></div>
  <div class="frame"></div>
  <div class="inner">
    <header>
      <div class="brand">FIRESHOT<small>DEFESA DE REDE</small></div>
      <div class="kind">Certificado de conclusão<br>Percurso educacional</div>
    </header>
    <h1>Certificado</h1>
    <p class="lead">Certificamos que</p>
    <div class="holder">{holder}</div>
    <div class="body">
      concluiu o percurso educacional <strong>{issuer}</strong>, com
      <strong>{hours} horas</strong> de atividade registrada, resolvendo os terminais de
      avaliação de cada módulo e cumprindo todos os objetivos de aprendizagem abaixo.
      <ul class="modules">{modules}</ul>
    </div>
    <footer>
      <div class="meta">
        Emitido em <strong>{issued}</strong><br>
        Código de verificação<br><span class="code">{code}</span><br>
        {verify_url}
      </div>
      <div class="qr"><img src="{qr}" alt="QR code de verificação">Verifique a autenticidade</div>
      <div class="sign">
        <div class="line"></div>
        Coordenação Fireshot<br>Assinatura digital Ed25519
      </div>
    </footer>
  </div>
  <div class="disclaimer">
    Este certificado atesta a conclusão de um percurso educacional em formato de jogo e não constitui
    formação profissional regulamentada nem certificação de mercado.
  </div>
</div></body></html>
"""


def _qr_data_uri(url: str) -> str:
    qr = qrcode.QRCode(version=None, box_size=10, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0d2a4a", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def verify_url(code: str) -> str:
    return f"{get_settings().verify_base_url.rstrip('/')}/{code}"


def _fmt_date(dt: datetime) -> str:
    months = [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ]
    return f"{dt.day} de {months[dt.month - 1]} de {dt.year}"


def render_pdf(cert: Certificate) -> bytes:
    url = verify_url(cert.code)
    hours = f"{float(cert.active_hours):.1f}".replace(".", ",")
    html = TEMPLATE.format(
        code=cert.code,
        holder=cert.full_name or "Titular anonimizado",
        issuer=get_settings().issuer_name,
        hours=hours,
        modules="".join(f"<li>{m}</li>" for m in cert.modules),
        issued=_fmt_date(cert.issued_at),
        verify_url=url.replace("https://", "").replace("http://", ""),
        qr=_qr_data_uri(url),
    )
    return HTML(string=html).write_pdf()
