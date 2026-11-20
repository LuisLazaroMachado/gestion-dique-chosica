# Motor de simulación y guía de desarrollo

## Niveles
- **A — visualizador geográfico:** mapa, relieve, cauce, corredor dibujado/analizado y animación conceptual. No calcula hidráulica.
- **B — modelo exploratorio simplificado:** parámetros y aproximaciones; requiere revisión técnica y advertencias.
- **C — modelo hidráulico/de flujo validado:** requiere topografía, geometría, parámetros, condiciones de borde, calibración, sensibilidad y revisión profesional. No se considera incluido en la primera versión.

## Interfaz
Seleccionar estructura(s), mostrar calidad del dato, elegir escenario parcial/completo, editar parámetros permitidos, ejecutar/pausar/reiniciar, activar capas, comparar y exportar. Mostrar fuentes y confianza.

## Salidas
ID de escenario, estructuras origen, parámetros, versión del motor, fecha, geometrías, variables calculadas con unidades, mapa/animación, limitaciones y nivel de validación.

## Seguridad interpretativa
Mostrar “Escenario hipotético — no es alerta oficial”. No declarar viviendas seguras por estar fuera de un corredor exploratorio. No recomendar evacuaciones automáticamente. No mostrar variables no soportadas.

## Guía de implementación
1. Conciliar inventario georreferenciado.
2. Definir nivel A/B/C.
3. Obtener DEM/capas con metadatos y licencias.
4. Diseñar modelo de escenario y visualización de incertidumbre.
5. Probar con datos sintéticos.
6. Guardar parámetros para reproducibilidad.
7. Mantener módulo desacoplado de priorización.
8. Validar con especialistas antes de uso operacional.
