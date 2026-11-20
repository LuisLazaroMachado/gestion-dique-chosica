# Método de exposición poblacional

## Definición
N_i es el número estimado de personas potencialmente afectadas si falla la estructura i, dentro de un polígono de escenario documentado. No es probabilidad de falla.

## Fórmula acordada
\[
N_i=V_i\times H_i
\]
V_i = viviendas ocupadas o presumiblemente ocupadas dentro del polígono. H_i = promedio de habitantes por vivienda/hogar derivado de la mejor fuente local.

## Jerarquía de datos
1. Censo/padrón oficial georreferenciado a nivel de manzana o vivienda.
2. Registro municipal validado y actualizado.
3. Estudios CENEPRED u otras evaluaciones oficiales del área.
4. Promedio local/sectorial con supuestos explícitos.
5. Interpretación cartográfica de construcciones solo como aproximación de viviendas, no de población.

## Referencias de contexto
- INEI/GeoPerú: 237,119 personas en viviendas particulares ocupadas y 66,221 hogares; aprox. 3.58 personas/hogar. No es promedio exacto por vivienda.
- CENEPRED Vizcachera: 4,539 personas / 1,646 predios; aprox. 2.76 personas/predio en ese estudio. Predio no equivale necesariamente a vivienda ocupada.

## Procedimiento
1. Delimitar polígono con topografía/cauce y supuestos.
2. Registrar versión, fecha y fuente del polígono.
3. Identificar viviendas y clasificar ocupación: confirmada, presumible, desocupada o desconocida.
4. Aplicar fuente H compatible.
5. Calcular N y, cuando sea posible, rango de incertidumbre.
6. Guardar fuente, método, fecha, autor y confianza.
7. Recalcular prioridad conservando el cálculo anterior.

No usar círculos arbitrarios. Una vivienda puede aparecer en más de un escenario; no sumar N de varios diques como población única.
