import { AutoFirstMessageCampaign } from '../../types';

export function generarScriptPythonAutomatizador(
  campaign: AutoFirstMessageCampaign,
  appBaseUrl: string,
  sheetUrlOrId: string,
  appsScriptUrl: string
): string {
  const queueJsonString = JSON.stringify(campaign.items, null, 2);
  const safeAppUrl = (appBaseUrl || 'http://localhost:3000').replace(/\/+$/, '');

  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
AUTOMATIZADOR STEALTH v2.0 ANTI-RESTRICCIÓN WHATSAPP — RUTAS POPURRÍ (CABA)
================================================================================
Novedades críticas de seguridad Stealth v2.0 (Corrige restricción de dispositivos vinculados):
1. CERO RECARGA DE PÁGINA (Sin page.goto en el bucle):
   Abre cada conversación mediante el router interno SPA de WhatsApp Web inyectando un
   clic en <a href="https://wa.me/..."> dentro del DOM activo. Nunca recarga la web ni
   interrumpe el WebSocket de sesión.
2. NAVEGADOR CHROME REAL + STEALTH (Sin huella de bot):
   Inicia Google Chrome / Edge nativo con '--disable-blink-features=AutomationControlled',
   elimina '--enable-automation' y anula 'navigator.webdriver'.
3. CIRCUIT BREAKER (Freno de Emergencia Instantáneo):
   Si WhatsApp Web cierra la sesión, pide QR o muestra aviso de restricción temporal,
   detiene el script en el acto SIN intentar los contactos siguientes ni marcar falsos errores.
4. MENSAJE ROMPEHIELO CORTO (< 220 caracteres) + FILTRO INTERNACIONAL (+54):
   Evita textos largos con pinta de campaña masiva o envíos de madrugada (< 09:00 hs).

INSTALACIÓN (una sola vez):
  pip install playwright requests
  playwright install chromium

EJECUCIÓN:
  python automatizador_wa_popurri.py
  python automatizador_wa_popurri.py --empezar-ya
================================================================================
"""

import argparse
import csv
import datetime
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    print("Falta la librería 'requests'. Instalala con: pip install requests playwright")
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("Falta la librería 'playwright'. Instalala con:")
    print("  pip install playwright requests")
    print("  playwright install chromium")
    sys.exit(1)

# ------------------------------------------------------------------------------
# CONFIGURACIÓN PRECARGADA DESDE LA APP RUTAS POPURRÍ (STEALTH v2.0)
# ------------------------------------------------------------------------------
APP_BASE_URL = "${safeAppUrl}"
GOOGLE_SHEET_ID_OR_URL = "${sheetUrlOrId || ''}"
APPS_SCRIPT_WEBHOOK_URL = "${appsScriptUrl || ''}"

HORA_INICIO_PROGRAMADA = "${campaign.config.horaInicio}"
VENTANA_HORARIA_INICIO = "${campaign.config.horaVentanaInicio}"
VENTANA_HORARIA_FIN = "${campaign.config.horaVentanaFin}"

MIN_CUPO_MENSAJES = ${campaign.config.minCupo}
MAX_CUPO_MENSAJES = min(44, ${campaign.config.maxCupo})  # NUNCA >= 45
CUPO_SORTEADO_ESTA_TANDA = min(44, ${campaign.config.cupoSorteado})

MIN_INTERVALO_SEG = max(55, ${campaign.config.minIntervaloSeg})
MAX_INTERVALO_SEG = max(MIN_INTERVALO_SEG + 25, ${campaign.config.maxIntervaloSeg})
LOTE_PAUSA_CAFE_CADA = ${campaign.config.lotePausaCafeCada}
MIN_PAUSA_CAFE_MIN = ${campaign.config.minPausaCafeMinutos}
MAX_PAUSA_CAFE_MIN = ${campaign.config.maxPausaCafeMinutos}
USAR_REESCRITURA_IA_GEMINI = ${campaign.config.usarVariabilidadIAGemini ? 'True' : 'False'}
INCLUIR_OPT_OUT_BAJA = ${campaign.config.incluirOptOutBaja ? 'True' : 'False'}
SOLO_NUMEROS_ARGENTINA_54 = ${campaign.config.soloNumerosArgentina !== false ? 'True' : 'False'}

ARCHIVO_SQLITE_CONTROL = "control_enviados_popurri.db"
ARCHIVO_REPORTE_JSON = "reporte_envios_popurri.json"
ARCHIVO_REPORTE_CSV = "reporte_envios_popurri.csv"
DIRECTORIO_SESION_WA = str(Path(__file__).resolve().parent / "sesion_whatsapp_popurri")
ARCHIVO_SELLO_VINCULACION = str(Path(DIRECTORIO_SESION_WA) / "vinculacion_timestamp.txt")

# Cola de contactos pendientes de 1er mensaje generada por la App (< 45 contactos)
COLA_PRIMER_CONTACTO = json.loads(r'''${queueJsonString}''')


# ------------------------------------------------------------------------------
# CAPA 7: CONTROL PERSISTENTE EN SQLITE + JSON PARA NO REENVIAR JAMÁS
# ------------------------------------------------------------------------------
def inicializar_db_control() -> sqlite3.Connection:
    conn = sqlite3.connect(ARCHIVO_SQLITE_CONTROL)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS envios_primer_contacto (
            telefono_norm TEXT PRIMARY KEY,
            contact_id TEXT,
            nombre TEXT,
            barrio TEXT,
            enviado TEXT,
            resultado TEXT,
            detalle TEXT,
            mensaje_enviado TEXT,
            fecha_hora_iso TEXT
        )
        """
    )
    conn.commit()
    return conn


def ya_fue_procesado_en_db(conn: sqlite3.Connection, contact_id: str, telefono_norm: str) -> tuple:
    cur = conn.cursor()
    cur.execute(
        "SELECT resultado, fecha_hora_iso FROM envios_primer_contacto WHERE telefono_norm = ? OR contact_id = ?",
        (str(telefono_norm), str(contact_id)),
    )
    fila = cur.fetchone()
    if fila and fila[0] in ("ENVIADO_OK", "NUMERO_INEXISTENTE"):
        return (True, fila[0], fila[1])
    return (False, None, None)


def registrar_en_db_control(
    conn: sqlite3.Connection,
    item: dict,
    resultado: str,
    detalle: str,
    mensaje_final: str,
):
    ahora_iso = datetime.datetime.now().isoformat()
    enviado_si_no = "Sí" if resultado == "ENVIADO_OK" else "No"
    conn.execute(
        """
        INSERT OR REPLACE INTO envios_primer_contacto
        (telefono_norm, contact_id, nombre, barrio, enviado, resultado, detalle, mensaje_enviado, fecha_hora_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(item.get("telefonoNorm", "")),
            str(item.get("contactId", "")),
            str(item.get("nombre", "")),
            str(item.get("barrio", "")),
            enviado_si_no,
            resultado,
            detalle,
            mensaje_final,
            ahora_iso,
        ),
    )
    conn.commit()


# ------------------------------------------------------------------------------
# CAPA 1: VARIABILIDAD POLIMÓRFICA Y SANITIZACIÓN ANTI-FILTRO META
# ------------------------------------------------------------------------------
def sanitizar_sin_urls(texto: str) -> str:
    """Elimina cualquier enlace http/https/bit.ly del primer mensaje."""
    sin_links = re.sub(r"https?://\\S+", "", texto, flags=re.IGNORECASE)
    sin_links = re.sub(r"\\b(?:www\\.|bit\\.ly/|wa\\.me/)\\S+", "", sin_links, flags=re.IGNORECASE)
    return re.sub(r"[ \\t]{2,}", " ", sin_links).strip()


def obtener_mensaje_unico_ia_o_spintax(item: dict, indice_iteracion: int) -> str:
    mensaje_base = item.get("mensajePrimerContacto", "")
    if not USAR_REESCRITURA_IA_GEMINI:
        return sanitizar_sin_urls(mensaje_base)

    try:
        resp = requests.post(
            f"{APP_BASE_URL}/api/gemini/variante-primer-contacto",
            json={
                "nombre": item.get("primerNombre") or item.get("nombre") or "",
                "sinNombre": bool(item.get("sinNombre")),
                "barrio": item.get("barrio") or "CABA",
                "mensajeBase": mensaje_base,
                "iteracion": indice_iteracion,
                "incluirOptOutBaja": INCLUIR_OPT_OUT_BAJA,
            },
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            if data.get("ok") and data.get("mensaje"):
                return sanitizar_sin_urls(data["mensaje"])
    except Exception:
        pass

    return sanitizar_sin_urls(mensaje_base)


# ------------------------------------------------------------------------------
# CAPA 5: VALIDACIÓN DE VENTANA HORARIA DIURNA ESTRICTA (PROHIBIDO MADRUGADA)
# ------------------------------------------------------------------------------
def parsear_hora_hhmm(hhmm_str: str) -> datetime.time:
    partes = [int(p) for p in hhmm_str.strip().split(":")]
    return datetime.time(hour=partes[0], minute=partes[1], second=0)


def esta_dentro_de_ventana_comercial() -> tuple:
    ahora = datetime.datetime.now().time()
    # Protección anti-ban: nunca permitir menos de las 09:00 AM (enviar a las 05:32 AM dispara bloqueo inmediato)
    t_inicio_cfg = parsear_hora_hhmm(VENTANA_HORARIA_INICIO)
    t_min_seguro = datetime.time(hour=9, minute=0, second=0)
    t_inicio = max(t_inicio_cfg, t_min_seguro)
    t_fin = parsear_hora_hhmm(VENTANA_HORARIA_FIN)
    if ahora < t_inicio:
        return (False, "ANTES_DE_APERTURA", t_inicio.strftime("%H:%M"))
    if ahora >= t_fin:
        return (False, "DESPUES_DE_CIERRE", t_fin.strftime("%H:%M"))
    return (True, "OK", "")


def esperar_hasta_hora_inicio(hora_objetivo_str: str):
    partes = [int(p) for p in hora_objetivo_str.strip().split(":")]
    # Si programaron antes de las 09:00 AM, proteger la cuenta pasando a las 09:30 AM
    if partes[0] < 9:
        print(f"\\n⚠️ [PROTECCIÓN ANTI-BLOQUEO] La hora {hora_objetivo_str} es de madrugada.")
        print("   Enviar primeros mensajes a desconocidos antes de las 09:00 AM activa la restricción de dispositivos vinculados.")
        print("   Se ajusta automáticamente el inicio a las 09:30 hs.")
        partes = [9, 30]

    ahora = datetime.datetime.now()
    objetivo = ahora.replace(hour=partes[0], minute=partes[1], second=0, microsecond=0)

    if objetivo <= ahora:
        return

    segundos_espera = int((objetivo - ahora).total_seconds())
    print(f"[RELOJ] Esperando hasta las {partes[0]:02d}:{partes[1]:02d} ({segundos_espera // 60} min {segundos_espera % 60} seg)...")
    while datetime.datetime.now() < objetivo:
        restante = int((objetivo - datetime.datetime.now()).total_seconds())
        if restante <= 0:
            break
        sys.stdout.write(f"\\r  -> Iniciando en {restante // 60:02d}m {restante % 60:02d}s... ")
        sys.stdout.flush()
        time.sleep(min(5, restante))
    print("\\n[OK] ¡Hora de inicio alcanzada!")


def reportar_resultado_en_vivo(item: dict, resultado: str, detalle: str):
    ahora_iso = datetime.datetime.now().isoformat()
    item["resultado"] = resultado
    item["detalleResultado"] = detalle
    item["fechaHoraResultadoISO"] = ahora_iso

    payload_item = {
        "campaignId": "${campaign.campaignId}",
        "contactId": item["contactId"],
        "telefonoNorm": item["telefonoNorm"],
        "nombre": item["nombre"],
        "barrio": item["barrio"],
        "resultado": resultado,
        "detalleResultado": detalle,
        "fechaHoraResultadoISO": ahora_iso,
        "appsScriptUrl": APPS_SCRIPT_WEBHOOK_URL,
    }

    try:
        resp = requests.post(
            f"{APP_BASE_URL}/api/auto-wa/report-item",
            json=payload_item,
            timeout=10,
        )
        if resp.ok:
            item["sincronizadoSheets"] = True
            print(f"  [SYNC APP] Estado actualizado en la App para #{item['contactId']} ({resultado}).")
    except Exception as exc:
        print(f"  [AVISO] Guardado en SQLite/JSON local ({exc}).")

    if APPS_SCRIPT_WEBHOOK_URL and APPS_SCRIPT_WEBHOOK_URL.startswith("https://script.google.com/"):
        estado_etiqueta = (
            "2. 1er contacto enviado (Sin respuesta)"
            if resultado == "ENVIADO_OK"
            else "10. Descartado / Baja / N° inexistente"
            if resultado == "NUMERO_INEXISTENTE"
            else "1. Sin contactar (Reintentar envío)"
        )
        try:
            requests.post(
                APPS_SCRIPT_WEBHOOK_URL,
                json={
                    "action": "updateAutoFirstContact",
                    "payload": {
                        "id": item["contactId"],
                        "telefonoNorm": item["telefonoNorm"],
                        "resultado": resultado,
                        "estado": estado_etiqueta,
                        "detalle": detalle,
                        "fechaHoraISO": ahora_iso,
                    },
                },
                timeout=12,
            )
            print(f"  [SYNC SHEETS] Fila #{item['contactId']} actualizada en Google Sheets -> {estado_etiqueta}")
        except Exception as exc:
            print(f"  [AVISO SHEETS] No se pudo notificar al Apps Script directamente: {exc}")


def guardar_reportes_locales(items: list):
    with open(ARCHIVO_REPORTE_JSON, "w", encoding="utf-8") as f_json:
        json.dump(
            {
                "campaignId": "${campaign.campaignId}",
                "actualizadoEnISO": datetime.datetime.now().isoformat(),
                "items": items,
            },
            f_json,
            ensure_ascii=False,
            indent=2,
        )

    with open(ARCHIVO_REPORTE_CSV, "w", encoding="utf-8-sig", newline="") as f_csv:
        writer = csv.writer(f_csv)
        writer.writerow([
            "Orden", "ID", "Nombre", "Barrio", "Telefono", "Enviado",
            "Hora_Programada", "Resultado", "Detalle", "Fecha_Hora_Real"
        ])
        for it in items:
            enviado_str = "Sí" if it.get("resultado") == "ENVIADO_OK" else "No"
            writer.writerow([
                it.get("orden"),
                it.get("contactId"),
                it.get("nombre"),
                it.get("barrio"),
                it.get("telRaw"),
                enviado_str,
                it.get("horaProgramada"),
                it.get("resultado"),
                it.get("detalleResultado"),
                it.get("fechaHoraResultadoISO", ""),
            ])


# ------------------------------------------------------------------------------
# CIRCUIT BREAKER + NAVEGACIÓN SPA SIN RECARGAR PÁGINA (STEALTH v2.0)
# ------------------------------------------------------------------------------
def detectar_restriccion_o_cierre_sesion(page) -> tuple:
    """
    Verifica si WhatsApp Web cerró la sesión vinculada, volvió a la pantalla de QR
    o mostró el cartel 'Your account on linked devices is restricted right now'.
    """
    try:
        texto_body = page.locator("body").inner_text(timeout=1500).lower()
        frases_restriccion = [
            "your account on linked devices is restricted",
            "tu cuenta en dispositivos vinculados está restringida",
            "dispositivos vinculados está restringida",
            "recent activity on your account may be a sign of spam",
            "actividad reciente en tu cuenta",
            "use whatsapp on your computer",
            "usa whatsapp en tu computadora",
            "para usar whatsapp en tu computadora",
            "log in to whatsapp web",
        ]
        for frase in frases_restriccion:
            if frase in texto_body:
                return (True, f"WhatsApp cerró la sesión o restringió el dispositivo vinculado ('{frase}')")
        # También verificar si apareció el canvas del código QR y desapareció #pane-side
        qr_visible = page.locator('canvas[aria-label*="QR"], [data-testid="qrcode"]').first.is_visible()
        pane_visible = page.locator('#pane-side').first.is_visible()
        if qr_visible and not pane_visible:
            return (True, "La sesión de WhatsApp Web se desconectó (apareció pantalla de código QR).")
    except Exception:
        pass
    return (False, "")


def abrir_chat_spa_sin_recargar(page, telefono_norm: str):
    """
    CLAVE ANTI-BLOQUEO STEALTH v2.0:
    NUNCA usa page.goto("https://web.whatsapp.com/send?phone=...") porque eso recarga toda la SPA,
    corta el WebSocket y dispara el bloqueo de dispositivos vinculados de Meta.
    En su lugar, inyecta un enlace <a href="https://wa.me/..."> dentro del DOM ya cargado
    y le hace clic para que el router interno de WhatsApp Web abra el chat instantáneamente SIN recargar.
    """
    page.evaluate(
        """(phone) => {
            let link = document.getElementById('popurri-spa-link');
            if (!link) {
                link = document.createElement('a');
                link.id = 'popurri-spa-link';
                link.style.display = 'none';
                document.body.appendChild(link);
            }
            link.setAttribute('href', 'https://wa.me/' + phone);
            link.click();
        }""",
        telefono_norm,
    )


def enviar_mensaje_whatsapp_web_stealth(page, telefono_norm: str, texto_mensaje: str) -> tuple:
    """
    Abre el chat sin recargar la página (SPA click), verifica que no haya restricción,
    detecta números inexistentes y simula escritura humana con cadencia variable.
    """
    restringido_antes, motivo_antes = detectar_restriccion_o_cierre_sesion(page)
    if restringido_antes:
        return ("SESION_RESTRINGIDA_ABORTAR", motivo_antes)

    abrir_chat_spa_sin_recargar(page, telefono_norm)
    time.sleep(random.uniform(1.8, 3.0))

    tiempo_max_carga = 28
    inicio = time.time()

    while time.time() - inicio < tiempo_max_carga:
        restringido, motivo_rest = detectar_restriccion_o_cierre_sesion(page)
        if restringido:
            return ("SESION_RESTRINGIDA_ABORTAR", motivo_rest)

        contenido_visible = ""
        try:
            contenido_visible = page.locator("body").inner_text(timeout=1500).lower()
        except Exception:
            pass

        frases_inexistente = [
            "el número de teléfono compartido a través de la dirección url no es válido",
            "phone number shared via url is invalid",
            "el número de teléfono no está en whatsapp",
            "no es un número válido",
            "isn't on whatsapp",
        ]
        if any(frase in contenido_visible for frase in frases_inexistente):
            try:
                boton_ok = page.locator('[data-animate-modal-popup="true"] button, div[role="dialog"] button').first
                if boton_ok.is_visible():
                    time.sleep(random.uniform(0.6, 1.2))
                    boton_ok.click()
            except Exception:
                pass
            return ("NUMERO_INEXISTENTE", "El número no existe en WhatsApp")

        caja_mensaje = page.locator(
            '#main footer div[contenteditable="true"], '
            'div[contenteditable="true"][data-tab="10"], '
            'footer div[contenteditable="true"][role="textbox"]'
        ).first
        try:
            if caja_mensaje.is_visible():
                # Pausa natural de lectura antes de tocar la caja de texto
                time.sleep(random.uniform(1.2, 2.5))
                caja_mensaje.click()

                segundos_escritura = max(4.5, len(texto_mensaje) / random.uniform(15.0, 19.0))
                print(f"  [ESCRITURA HUMANA] Redactando durante {segundos_escritura:.1f}s ({len(texto_mensaje)} caracteres)...")

                parrafos = texto_mensaje.split("\\n")
                for p_idx, parrafo in enumerate(parrafos):
                    if parrafo:
                        # Tipear palabra por palabra con micro-pausas variables como un humano real
                        palabras = parrafo.split(" ")
                        for w_idx, palabra in enumerate(palabras):
                            fragmento = palabra + (" " if w_idx < len(palabras) - 1 else "")
                            delay_tecla = random.randint(35, 85)
                            page.keyboard.type(fragmento, delay=delay_tecla)
                            if w_idx % 6 == 0 and w_idx > 0:
                                time.sleep(random.uniform(0.15, 0.45))
                    if p_idx < len(parrafos) - 1:
                        page.keyboard.down("Shift")
                        page.keyboard.press("Enter")
                        page.keyboard.up("Shift")
                        time.sleep(random.uniform(0.3, 0.7))

                # Pausa de revisión antes de presionar Enter
                time.sleep(random.uniform(1.6, 3.4))
                page.keyboard.press("Enter")

                # Respaldo: si el botón Enviar sigue visible tras Enter, hacer clic
                try:
                    time.sleep(0.6)
                    btn_send = page.locator('#main footer button[aria-label="Enviar"], #main footer span[data-icon="send"]').first
                    if btn_send.is_visible():
                        btn_send.click()
                except Exception:
                    pass

                # Una vez disparado el envío, JAMÁS marcar como timeout de apertura de chat
                try:
                    time.sleep(random.uniform(2.5, 4.0))
                    restringido_post, motivo_post = detectar_restriccion_o_cierre_sesion(page)
                    if restringido_post:
                        return ("SESION_RESTRINGIDA_ABORTAR", motivo_post)
                except Exception:
                    pass

                return ("ENVIADO_OK", f"Primer mensaje enviado con éxito (Stealth SPA, {segundos_escritura:.1f}s)")
        except Exception as e_type:
            print(f"  [AVISO COMPOSER] Reintentando foco en caja de mensaje: {e_type}")

        time.sleep(1.0)

    restringido_fin, motivo_fin = detectar_restriccion_o_cierre_sesion(page)
    if restringido_fin:
        return ("SESION_RESTRINGIDA_ABORTAR", motivo_fin)

    return ("ERROR_ENVIO", "Tiempo de espera agotado al abrir el chat")


def lanzar_navegador_stealth(p):
    """
    Intenta abrir el navegador Google Chrome real instalado en la PC (o Microsoft Edge)
    desactivando las banderas 'AutomationControlled' y 'navigator.webdriver' para que
    WhatsApp Web no detecte Playwright.
    """
    argumentos_stealth = [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--disable-infobars",
    ]
    for canal in ["chrome", "msedge", None]:
        try:
            kwargs = {
                "user_data_dir": DIRECTORIO_SESION_WA,
                "headless": False,
                "viewport": {"width": 1280, "height": 840},
                "args": argumentos_stealth,
                "ignore_default_args": ["--enable-automation"],
            }
            if canal:
                kwargs["channel"] = canal
            ctx = p.chromium.launch_persistent_context(**kwargs)
            ctx.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )
            print(f"[STEALTH] Navegador iniciado en modo humano real (canal: {canal or 'chromium-stealth'}).")
            return ctx
        except Exception:
            continue
    raise RuntimeError("No se pudo iniciar Chrome/Edge/Chromium.")


def main():
    parser = argparse.ArgumentParser(description="Automatizador Stealth v2.0 Anti-Restricción — Rutas POPURRÍ")
    parser.add_argument("--hora", type=str, default=HORA_INICIO_PROGRAMADA, help="Hora de inicio en formato HH:MM (>= 09:00)")
    parser.add_argument("--empezar-ya", action="store_true", help="Comenzar inmediatamente (siempre que sea >= 09:00)")
    parser.add_argument("--max-mensajes", type=int, default=CUPO_SORTEADO_ESTA_TANDA, help="Tope de mensajes (< 45)")
    parser.add_argument("--permitir-internacionales", action="store_true", help="Permitir números fuera de Argentina (+54)")
    args = parser.parse_args()

    conn = inicializar_db_control()

    cupo_seguro = min(44, max(1, args.max_mensajes))
    cola_activa = COLA_PRIMER_CONTACTO[:cupo_seguro]

    print("=" * 78)
    print("  RUTAS POPURRÍ — AUTOMATIZADOR STEALTH v2.0 (CERO RECARGA SPA + CHROME REAL)")
    print("=" * 78)
    print(f"  * Contactos en cola (sólo 1er mensaje): {len(cola_activa)} (Tope estricto < 45)")
    print(f"  * Navegación interna SPA              : ACTIVA (Sin page.goto por contacto)")
    print(f"  * Ventana horaria diurna segura       : >= 09:00 a {VENTANA_HORARIA_FIN} (Prohibido madrugada)")
    print(f"  * Intervalo no lineal entre mensajes  : {MIN_INTERVALO_SEG}s a {MAX_INTERVALO_SEG}s")
    print(f"  * Pausa de café cada {LOTE_PAUSA_CAFE_CADA} mensajes       : {MIN_PAUSA_CAFE_MIN} a {MAX_PAUSA_CAFE_MIN} minutos")
    print(f"  * Base SQLite anti-duplicados         : {ARCHIVO_SQLITE_CONTROL}")
    print("=" * 78)

    if len(cola_activa) == 0:
        print("[FIN] No hay contactos pendientes de primer mensaje en la cola actual.")
        return

    es_primera_vinculacion = not Path(ARCHIVO_SELLO_VINCULACION).exists()

    with sync_playwright() as p:
        print("\\n[PASO 1] Abriendo navegador Stealth con sesión persistente de WhatsApp Web...")
        context = lanzar_navegador_stealth(p)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

        print("[ESPERA] Verificando que WhatsApp Web esté vinculado...")
        page.wait_for_selector('#pane-side, [aria-label="Lista de chats"]', timeout=180000)
        print("[OK] ¡WhatsApp Web vinculado y listo!")

        if es_primera_vinculacion:
            Path(ARCHIVO_SELLO_VINCULACION).write_text(datetime.datetime.now().isoformat(), encoding="utf-8")
            print("\\n🛡️ [PROTECCIÓN DE REPOSO POST-QR] Es la primera vez que se vincula esta sesión.")
            print("   Esperando 90 segundos de reposo orgánico antes del primer envío para no disparar alertas de sesión recién vinculada...")
            time.sleep(90)

        if not args.empezar_ya:
            esperar_hasta_hora_inicio(args.hora)

        enviados_ok = 0
        inexistentes = 0
        errores = 0
        omitidos_previos = 0
        enviados_en_esta_sesion = 0
        proximo_lote_cafe = random.randint(7, 11)

        for idx, item in enumerate(cola_activa):
            orden = idx + 1
            contact_id = str(item.get("contactId", ""))
            nombre = item.get("nombre", "Contacto")
            tel = str(item.get("telefonoNorm", ""))

            # 1. Control idempotente: saltar si ya fue enviado en una corrida anterior
            ya_procesado, res_previo, fecha_previa = ya_fue_procesado_en_db(conn, contact_id, tel)
            if ya_procesado:
                omitidos_previos += 1
                item["resultado"] = res_previo
                item["detalleResultado"] = f"Saltado automáticamente: ya figuraba como {res_previo} ({fecha_previa})"
                print(f"\\n[{orden}/{len(cola_activa)}] ⏭️ SALTANDO #{contact_id} ({nombre}): ya fue procesado antes ({res_previo}).")
                continue

            # 2. Guardia contra números internacionales en frío (ej. +34 España como #167)
            if SOLO_NUMEROS_ARGENTINA_54 and not args.permitir_internacionales and not tel.startswith("54"):
                print(f"\\n[{orden}/{len(cola_activa)}] 🛡️ SALTANDO N° INTERNACIONAL #{contact_id} ({nombre} - +{tel}):")
                print("   Enviar en frío desde un dispositivo vinculado a números de otro país (+34, etc.) dispara bloqueo en Meta.")
                print("   Enviale a este contacto manualmente desde tu celular principal con 1 clic.")
                continue

            # 3. Verificar ventana horaria diurna (>= 09:00 a 19:00)
            en_ventana, motivo_ventana, hora_ref = esta_dentro_de_ventana_comercial()
            if not en_ventana and motivo_ventana == "DESPUES_DE_CIERRE":
                print(f"\\n[PROTECCIÓN HORARIA] Son más de las {VENTANA_HORARIA_FIN}. Se pausa la tanda y se guarda el progreso para mañana.")
                guardar_reportes_locales(cola_activa)
                break
            elif not en_ventana and motivo_ventana == "ANTES_DE_APERTURA":
                print(f"\\n[PROTECCIÓN ANTI-MADRUGADA] Aún no son las {hora_ref}. Esperando horario diurno seguro...")
                esperar_hasta_hora_inicio(hora_ref)

            # 4. Pausas humanas no lineales + "Pausa de Café"
            if enviados_en_esta_sesion > 0:
                if enviados_en_esta_sesion >= proximo_lote_cafe:
                    pausa_cafe_seg = int(random.uniform(MIN_PAUSA_CAFE_MIN * 60, MAX_PAUSA_CAFE_MIN * 60))
                    print(f"\\n☕ [PAUSA DE CAFÉ HUMANA] Ya se enviaron {enviados_en_esta_sesion} mensajes.")
                    print(f"   Descansando {pausa_cafe_seg // 60} min {pausa_cafe_seg % 60} seg antes de seguir...")
                    for seg in range(pausa_cafe_seg, 0, -1):
                        sys.stdout.write(f"\\r   -> Reanudando luego del café en {seg // 60:02d}m {seg % 60:02d}s... ")
                        sys.stdout.flush()
                        time.sleep(1)
                    print()
                    proximo_lote_cafe = enviados_en_esta_sesion + random.randint(7, 11)
                else:
                    modo_central = (MIN_INTERVALO_SEG + MAX_INTERVALO_SEG) / 2.0
                    pausa_no_lineal = int(random.triangular(MIN_INTERVALO_SEG, MAX_INTERVALO_SEG, modo_central))
                    print(f"\\n[INTERVALO HUMANO NO LINEAL] Esperando {pausa_no_lineal}s antes del contacto #{orden}...")
                    for seg in range(pausa_no_lineal, 0, -1):
                        sys.stdout.write(f"\\r  -> Próximo envío a {nombre} en {seg}s...   ")
                        sys.stdout.flush()
                        time.sleep(1)
                    print()

            # 5. Generar variante única de texto
            mensaje_unico = obtener_mensaje_unico_ia_o_spintax(item, orden)
            item["mensajePrimerContacto"] = mensaje_unico

            print(f"\\n[{orden}/{len(cola_activa)}] Enviando 1er mensaje único (Stealth SPA) a #{contact_id} - {nombre} ({tel})...")
            try:
                resultado, detalle = enviar_mensaje_whatsapp_web_stealth(page, tel, mensaje_unico)
            except PlaywrightTimeoutError:
                resultado, detalle = ("ERROR_ENVIO", "Timeout en WhatsApp Web")
            except Exception as exc:
                msg_exc = str(exc)
                if "interrupted by another navigation" in msg_exc.lower():
                    resultado, detalle = ("SESION_RESTRINGIDA_ABORTAR", "WhatsApp Web cerró la sesión vinculada.")
                else:
                    resultado, detalle = ("ERROR_ENVIO", f"Error inesperado: {exc}")

            # CIRCUIT BREAKER INMEDIATO: Si la sesión se cerró o restringió, frenar en seco SIN ensuciar #168, #169, #170
            if resultado == "SESION_RESTRINGIDA_ABORTAR":
                print("\\n" + "!" * 78)
                print("  🛑 FRENO DE EMERGENCIA (CIRCUIT BREAKER ACTIVADO)")
                print("!" * 78)
                print(f"  Motivo: {detalle}")
                print("  Se detiene el programa inmediatamente para proteger tu cuenta y NO marcar")
                print("  falsos errores en los contactos siguientes.")
                print("  👉 IMPORTANTE: No vuelvas a escanear el código QR durante 24 horas.")
                print("     Mientras dure la restricción en PC, podés enviar desde tu celular principal.")
                print("!" * 78)
                guardar_reportes_locales(cola_activa)
                break

            enviados_en_esta_sesion += 1
            if resultado == "ENVIADO_OK":
                enviados_ok += 1
                print(f"  ✅ ÉXITO: {detalle}")
            elif resultado == "NUMERO_INEXISTENTE":
                inexistentes += 1
                print(f"  🚫 NÚMERO INEXISTENTE: {detalle}")
            else:
                errores += 1
                print(f"  ⚠️ FALLÓ EL ENVÍO: {detalle}")

            registrar_en_db_control(conn, item, resultado, detalle, mensaje_unico)
            reportar_resultado_en_vivo(item, resultado, detalle)
            guardar_reportes_locales(cola_activa)

        print("\\n" + "=" * 78)
        print("  RESUMEN FINAL DE LA TANDA STEALTH v2.0")
        print("=" * 78)
        print(f"  * Total en cola (< 45)      : {len(cola_activa)}")
        print(f"  * ✅ Enviados con éxito      : {enviados_ok}")
        print(f"  * 🚫 N° WA inexistentes      : {inexistentes}")
        print(f"  * ⚠️ No enviados / Error     : {errores}")
        print(f"  * ⏭️ Saltados (ya enviados)  : {omitidos_previos}")
        print("=" * 78)
        time.sleep(4)
        context.close()
        conn.close()


if __name__ == "__main__":
    main()
`;
}

/**
 * Clasifica el estatus de una persona para la App de Estatus diaria (Adhirió, Encuentro Confirmado,
 * En conversación, Número inválido, Sin DNI en CABA, No vive en CABA, Baja).
 */

