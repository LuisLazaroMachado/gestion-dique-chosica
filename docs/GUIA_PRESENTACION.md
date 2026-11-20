# Guía para la presentación

## Qué llevar
- Laptop con navegador e internet.
- Teléfono Android con el APK instalado (`Priori Dique Inspector`) y una app de GPS simulado.
- Las credenciales de `credenciales-nube.txt` (están en la PC de casa: cópialas antes, por ejemplo a un gestor de contraseñas o a una nota protegida).

## 15 minutos antes
1. Abre https://priori-dique-api.onrender.com/health y espera la respuesta `{"ok":true,...}`. El plan gratuito "duerme" la API, y la primera carga puede tardar cerca de 1 minuto.
2. Abre https://priori-dique-web.onrender.com e inicia sesión con **responsable@priori-dique.pe**.
3. En el teléfono, abre la app e inicia sesión con **inspector@priori-dique.pe**. Las asignaciones se descargan solas.

## GPS simulado en el teléfono (para la demo)
1. Instala una app de ubicación simulada (por ejemplo, "Fake GPS location").
2. Activa las Opciones de desarrollador: Ajustes → Acerca del teléfono → toca 7 veces "Número de compilación".
3. En Opciones de desarrollador → "Seleccionar app de ubicación simulada" → elige la app instalada.
4. Coloca el punto sobre la quebrada Pedregal o Quirio (por ejemplo, -11.917, -76.704).
5. La app del inspector registrará la ubicación **marcada como simulada**, y la web lo mostrará así. Es intencional: los datos de prueba no se confunden con datos reales.

## Recorrido sugerido (8–10 min)
1. **Tablero (web):** 81 estructuras (52 de la línea base de Contraloría y 29 de ampliaciones), estados físicos, inspecciones vencidas. Explica las etiquetas *Documentado* y *Estimado*.
2. **Mapa:** colorea por estado físico, intervención o tipo; muestra las mallas con coordenadas documentadas y los cauces derivados del relieve.
3. **Priorización:** fórmula E = (D+C+A)/9, X = N/Nmax, P = E·X. Urgencia y acceso aparecen en columnas separadas. P no es probabilidad de falla.
4. **Asignaciones:** asigna una estructura al inspector.
5. **Teléfono:** "Descargar", activa el **modo avión**, abre la estructura, revisa las reglas de seguridad y completa D, C y A con fotos. Guarda: queda **Pendiente** en el teléfono.
6. Desactiva el modo avión → "Sincronizar" → **Confirmado por el servidor**. Si vuelves a sincronizar, no se duplica.
7. **Inspecciones (web):** abre la inspección, muestra las fotos y el GPS simulado y **valida**. El estado físico se actualiza y la prioridad se recalcula, quedando como versión nueva.
8. **Ficha de la estructura:** historial completo, exposición V×H, historial de prioridad y auditoría con antes y después.
9. **Intervenciones:** registra una y márcala "Finalizada". El estado físico **no** pasa a Operativo; eso solo ocurre con una nueva inspección.
10. **Rutas:** selecciona 4–5 estructuras → "Calcular recorrido" desde la base municipal; cambia el orden y justifícalo.
11. **Escenarios (nivel A):** elige un dique de Quirio → "Reproducir". Explica que es un escenario hipotético y no una alerta oficial.

## Mensajes clave
- El sistema **apoya** la decisión humana: no certifica seguridad ni emite alertas.
- Todo dato muestra su origen y confianza. Las ubicaciones de los 52 diques son **estimadas** (el informe de Contraloría no trae coordenadas) y se reemplazan desde la web con auditoría.
- Funciona sin conexión en campo y no pierde ni duplica registros.
- Arquitectura estándar y gratuita, migrable a la municipalidad sin reescribir.

## Plan B (sin internet en el lugar)
Requiere Docker Desktop y Node 22 instalados **en la laptop** y el repositorio clonado:
```bash
npm install && npm run db:up
cp .env.example .env.local
cd apps/api && ENV_FILE=.env.local npm run migrate && ENV_FILE=.env.local npm run seed && ENV_FILE=.env.local npm run dev
# otra terminal (desde la raíz):
npm run dev -w apps/web     # http://localhost:5173
```
Para el teléfono, conecta laptop y teléfono a la misma red (por ejemplo, el hotspot del teléfono). En la app toca **Configurar servidor** y escribe `http://IP-DE-LA-LAPTOP:3000`.
Los mapas base necesitan internet; sin conexión, los puntos y las capas se ven sobre fondo vacío.
