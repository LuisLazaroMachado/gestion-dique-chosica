# Fórmula y reglas de priorización

\[
E_i=(D_i+C_i+A_i)/9,\quad X_i=N_i/N_{\max},\quad P_i=E_iX_i
\]

D = daño estructural, C = colmatación, A = proceso activo (0–3). N_i = personas potencialmente afectadas por estructura i. Nmax = mayor N en el inventario vigente.

## Validaciones
- D, C y A deben ser enteros 0–3 y estar completos.
- Sin D/C/A completo, no calcular P.
- Exposición debe tener fuente, método y fecha.
- N y Nmax no pueden ser negativos.
- Si Nmax=0, X=0 y advertir que exposición necesita revisión.
- No redondear valores intermedios.
- Guardar versión de fórmula, Nmax, datos de entrada y fecha.

## Ejemplo matemático
D=2, C=3, A=1, N=300, Nmax=600: E=6/9=0.6667; X=0.5; P=0.3333. No corresponde a un dique real.

## Interpretación
P es un índice relativo de apoyo, no probabilidad de falla ni clasificación normativa de riesgo. No crear umbrales alto/medio/bajo sin aprobación. Empates los resuelve el responsable con justificación. Urgencia operativa se registra aparte y no modifica P.
