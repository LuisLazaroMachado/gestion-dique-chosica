# Guía para la presentación

## Qué llevar
- Laptop con navegador e internet.
- Celular Android con la app **Priori Dique Inspector** instalada (ver abajo) y una app de GPS simulado.
- Las credenciales de `credenciales-nube.txt` (están en la PC de casa; cópialas antes en un lugar seguro).

## Instalar la app en el celular (una sola vez)
1. Busca el archivo `apps/mobile/build-output/priori-dique-inspector.apk` en la carpeta del proyecto.
2. Pásalo al celular por cable USB (a la carpeta *Descargas*), por Google Drive o enviándotelo por WhatsApp como documento.
3. En el celular, toca el archivo. Android avisará que no permite apps de "fuentes desconocidas": toca **Configuración**, activa **Permitir de esta fuente** y vuelve atrás.
4. Toca **Instalar**. Si aparece un aviso de Play Protect, elige **Instalar de todos modos** (es tu propia app; no está en la tienda).
5. Aparecerá el ícono **Priori Dique Inspector**.

## 15 minutos antes
1. Abre https://priori-dique-api.onrender.com/health y espera la respuesta `{"ok":true,...}`. Como el plan es gratuito, la primera carga del día puede tardar cerca de 1 minuto.
2. Abre https://priori-dique-web.onrender.com e inicia sesión con **responsable@priori-dique.pe**.
3. En el celular, abre la app e inicia sesión con **inspector@priori-dique.pe**. Las estructuras que tiene encargadas se descargan solas.

## GPS simulado en el celular (para la demo)
1. Instala una app de ubicación simulada (por ejemplo, "Fake GPS location").
2. Activa las Opciones de desarrollador: Ajustes → Acerca del teléfono → toca 7 veces "Número de compilación".
3. En Opciones de desarrollador → "Seleccionar app de ubicación simulada" → elige la app instalada.
4. Coloca el punto sobre la quebrada Pedregal o Quirio (por ejemplo, -11.917, -76.704).
5. La app registrará la ubicación marcada como **simulada**, y la web lo mostrará así. Es intencional: los datos de prueba no se confunden con los reales.

## Recorrido sugerido (8 a 10 minutos)
1. **Tablero:** estructuras registradas, inspecciones por revisar, cuáles están al día o atrasadas, y las 10 que más urge atender. Pasa el mouse por los íconos ⓘ para ver qué significa cada dato.
2. **Mapa:** colorea por estado, trabajos o tipo. Haz clic en un dique, en una malla (morado) o en un cauce para ver su información.
3. **Prioridades:** muestra el recuadro "¿Cómo se calcula?". La urgencia y el acceso van aparte y no cambian el número.
4. **Encargar inspecciones:** encarga una estructura al inspector.
5. **Celular:** toca "Actualizar lista", activa el **modo avión**, abre la estructura, lee las reglas de seguridad y completa la inspección con fotos. Al guardar queda **Por enviar**.
6. Desactiva el modo avión y toca **Enviar pendientes**: pasa a **Enviada**. Si vuelves a enviar, no se duplica.
7. **Revisar inspecciones:** abre la inspección, muestra las fotos y la ubicación simulada, y toca **Aprobar**. El estado y la prioridad se actualizan solos.
8. **Ficha de la estructura** (desde Inventario): datos, personas expuestas, prioridad paso a paso e historial.
9. **Trabajos:** registra uno y márcalo "Finalizada". El estado de la estructura **no** cambia hasta una nueva inspección; es a propósito.
10. **Rutas de maquinaria:** elige 4 o 5 estructuras y toca "Calcular recorrido": propone el orden más corto por las calles. Arrastra una estructura para cambiar el orden y el mapa se recalcula al instante.
11. **Simulador de huaico:** elige un dique de Quirio y toca "Reproducir". Explica que es una simulación aproximada, no una alerta.
12. **Historial de cambios:** todo lo que hiciste en la demo aparece aquí, con quién, cuándo y por qué.

## Mensajes clave
- El sistema **apoya** la decisión de las personas: no certifica seguridad ni emite alertas.
- Cada dato indica si está **confirmado** o es **aproximado**. Las ubicaciones de los 52 diques son aproximadas (el informe de Contraloría no trae coordenadas) y se confirman con el GPS del inspector.
- La app del celular funciona sin internet y no pierde ni duplica inspecciones.
- Usa tecnología estándar y gratuita, y puede pasar a la municipalidad sin reescribirse.

## Plan B (sin internet en el lugar)
Requiere Docker Desktop y Node 22 instalados **en la laptop** y el proyecto descargado de GitHub:
```bash
npm install && npm run db:up
cp .env.example .env.local
cd apps/api && ENV_FILE=.env.local npm run migrate && ENV_FILE=.env.local npm run seed && ENV_FILE=.env.local npm run dev
# en otra terminal, desde la raíz:
npm run dev -w apps/web     # http://localhost:5173
```
Para el celular, conecta laptop y celular a la misma red (por ejemplo, el hotspot del celular). En la app toca **Configurar servidor** y escribe `http://IP-DE-LA-LAPTOP:3000`. Sin internet, los mapas de fondo no se cargan, pero los puntos y las capas sí se ven.
