import React from 'react';

interface PopurriBrandLogoProps {
  className?: string;
}

const PATH_SOMBRA_Y_FILETE =
  'M 1100 48 L 1168 48 L 1148 96 L 1146 101 L 1087 101 L 1100 49 Z M 313 98 L 350 99 L 368 104 L 383 112 L 396 124 L 408 144 L 413 160 L 416 180 L 417 179 L 417 103 L 511 103 L 541 108 L 551 112 L 565 123 L 573 135 L 579 157 L 580 156 L 580 103 L 663 103 L 663 260 L 664 261 L 666 257 L 666 103 L 748 103 L 748 276 L 745 291 L 738 306 L 726 319 L 708 329 L 681 335 L 639 334 L 620 329 L 608 323 L 602 319 L 593 310 L 583 291 L 580 275 L 580 241 L 580 223 L 579 222 L 577 233 L 571 248 L 566 255 L 555 265 L 543 271 L 532 274 L 518 276 L 503 276 L 501 278 L 501 329 L 417 329 L 417 252 L 416 251 L 414 267 L 407 290 L 399 304 L 389 315 L 378 323 L 362 330 L 342 334 L 313 334 L 297 331 L 276 322 L 269 317 L 256 303 L 247 286 L 243 273 L 240 256 L 240 227 L 239 226 L 231 248 L 227 254 L 218 263 L 212 267 L 192 274 L 162 277 L 161 279 L 161 329 L 77 329 L 77 103 L 171 103 L 188 105 L 207 110 L 220 118 L 232 133 L 237 146 L 240 168 L 242 166 L 242 162 L 247 145 L 253 133 L 265 118 L 274 111 L 285 105 L 301 100 L 312 99 Z M 750 103 L 843 103 L 861 105 L 877 109 L 887 114 L 900 126 L 908 141 L 912 160 L 912 211 L 906 232 L 898 244 L 908 296 L 911 319 L 913 324 L 914 323 L 914 103 L 1007 103 L 1025 105 L 1041 109 L 1051 114 L 1064 126 L 1070 136 L 1075 153 L 1076 210 L 1072 227 L 1062 244 L 1073 302 L 1075 319 L 1077 324 L 1078 323 L 1078 120 L 1078 103 L 1162 103 L 1162 329 L 997 329 L 996 290 L 995 289 L 994 290 L 994 329 L 833 329 L 832 289 L 831 288 L 830 289 L 830 329 L 750 329 L 750 104 Z M 158 171 L 157 172 L 157 214 L 159 216 L 160 215 L 160 172 L 159 171 Z M 498 171 L 497 172 L 497 215 L 499 216 L 500 215 L 500 172 L 499 171 Z M 831 171 L 830 172 L 830 206 L 832 207 L 833 206 L 833 172 L 832 171 Z M 995 171 L 994 172 L 994 206 L 996 207 L 997 206 L 997 172 L 996 171 Z M 327 179 L 326 180 L 326 251 L 328 253 L 329 252 L 329 180 L 328 179 Z';

const PATH_RELLENO_AMARILLO =
  'M 1105 54 L 1159 54 L 1143 91 L 1142 95 L 1095 95 L 1104 55 Z M 314 104 L 349 105 L 364 109 L 378 116 L 393 130 L 400 141 L 406 157 L 409 172 L 410 250 L 408 266 L 402 286 L 395 299 L 382 313 L 361 324 L 341 328 L 314 328 L 302 326 L 287 321 L 275 314 L 262 301 L 254 287 L 250 276 L 246 255 L 246 175 L 250 155 L 254 144 L 264 128 L 279 115 L 298 107 L 313 105 Z M 83 109 L 170 109 L 192 112 L 203 115 L 214 121 L 223 130 L 229 141 L 232 151 L 234 169 L 234 211 L 231 232 L 225 246 L 218 255 L 202 265 L 177 270 L 157 270 L 155 272 L 155 276 L 155 323 L 83 323 L 83 110 Z M 423 109 L 510 109 L 532 112 L 543 115 L 551 119 L 562 129 L 568 139 L 573 158 L 574 207 L 571 232 L 565 246 L 553 259 L 542 265 L 517 270 L 496 270 L 495 276 L 495 323 L 423 323 L 423 110 Z M 586 109 L 657 109 L 657 261 L 658 264 L 662 268 L 667 268 L 670 265 L 672 258 L 672 109 L 742 109 L 742 140 L 742 275 L 739 290 L 734 301 L 728 309 L 720 316 L 701 325 L 681 329 L 640 328 L 624 324 L 607 315 L 596 304 L 591 295 L 587 282 L 586 274 L 586 110 Z M 756 109 L 842 109 L 865 112 L 878 116 L 889 123 L 897 132 L 902 142 L 906 161 L 906 210 L 902 226 L 897 235 L 892 240 L 892 244 L 906 323 L 839 323 L 838 309 L 836 256 L 835 255 L 825 255 L 824 256 L 824 323 L 756 323 L 756 110 Z M 920 109 L 1006 109 L 1029 112 L 1042 116 L 1053 123 L 1060 131 L 1065 140 L 1070 161 L 1070 209 L 1066 226 L 1061 235 L 1056 240 L 1056 245 L 1058 251 L 1070 323 L 1003 323 L 1002 309 L 1000 256 L 999 255 L 989 255 L 988 256 L 988 323 L 920 323 L 920 110 Z M 1084 109 L 1156 109 L 1156 323 L 1084 323 L 1084 110 Z M 153 164 L 151 166 L 151 221 L 160 222 L 166 217 L 166 170 L 162 165 L 154 164 Z M 493 164 L 491 166 L 491 221 L 500 222 L 506 216 L 506 170 L 502 165 L 494 164 Z M 825 164 L 824 165 L 824 213 L 825 214 L 834 213 L 837 211 L 839 207 L 839 171 L 836 166 L 831 164 L 826 164 Z M 989 164 L 988 165 L 988 213 L 989 214 L 998 213 L 1001 211 L 1003 207 L 1003 171 L 1000 166 L 995 164 L 990 164 Z M 327 172 L 324 173 L 320 179 L 320 252 L 324 258 L 328 259 L 331 258 L 335 254 L 335 177 L 331 173 L 328 172 Z';

const PATH_P_SOMBRA_Y_FILETE =
  'M 77 103 L 171 103 L 188 105 L 207 110 L 220 118 L 232 133 L 237 146 L 240 168 L 240 212 L 239 226 L 231 248 L 227 254 L 218 263 L 212 267 L 192 274 L 162 277 L 161 279 L 161 329 L 77 329 L 77 103 Z M 158 171 L 157 172 L 157 214 L 159 216 L 160 215 L 160 172 L 159 171 Z';

const PATH_P_RELLENO_AMARILLO =
  'M 83 109 L 170 109 L 192 112 L 203 115 L 214 121 L 223 130 L 229 141 L 232 151 L 234 169 L 234 211 L 231 232 L 225 246 L 218 255 L 202 265 L 177 270 L 157 270 L 155 272 L 155 276 L 155 323 L 83 323 L 83 110 Z M 153 164 L 151 166 L 151 221 L 160 222 L 166 217 L 166 170 L 162 165 L 154 164 Z';

/**
 * Wordmark Oficial POPURRÍ (Vector 3 Capas:
 * Sombra 3D interna en Azul Petróleo Oscuro #25323A + Filete Rojo #FF2C00 + Relleno Amarillo #FFF06B
 * sobre Fondo Celeste Popurrí #2988FF)
 * - En móvil (< sm) muestra el monograma "P" compacto con la misma Sombra 3D #25323A y Fondo Celeste #2988FF.
 * - En web/desktop (sm+) mantiene el wordmark completo "POPURRÍ" sin cambios.
 */
export const PopurriBrandLogo: React.FC<PopurriBrandLogoProps> = ({
  className = 'h-8 sm:h-9 w-auto',
}) => {
  return (
    <>
      {/* Versión Móvil Compacta: Monograma "P" con Sombra 3D #25323A y Fondo Celeste #2988FF */}
      <div
        className="sm:hidden relative inline-flex items-center justify-center rounded-xl border-2 border-[#323232] bg-[#2988FF] p-1 shadow-[2px_2px_0px_#323232] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] transition-transform select-none shrink-0"
        title="POPURRÍ — Identidad Gráfica Oficial"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="65 90 220 280"
          role="img"
          aria-label="P — POPURRÍ"
          className="h-7 w-7"
        >
          <g id="Sombra_3D_Petroleo_P" transform="translate(8, 28)">
            <path fill="#25323A" fillRule="evenodd" d={PATH_P_SOMBRA_Y_FILETE} />
          </g>
          <g id="Filete_Rojo_Popurri_P" transform="translate(26, 4)">
            <path fill="#FF2C00" fillRule="evenodd" d={PATH_P_SOMBRA_Y_FILETE} />
          </g>
          <g id="Relleno_Amarillo_Popurri_P" transform="translate(26, 4)">
            <path fill="#FFF06B" fillRule="evenodd" d={PATH_P_RELLENO_AMARILLO} />
          </g>
        </svg>
      </div>

      {/* Versión Web / Desktop: Wordmark Completo POPURRÍ intacto */}
      <div
        className="hidden sm:inline-flex relative items-center justify-center rounded-xl border-2 border-[#323232] bg-[#2988FF] px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-[3px_3px_0px_#323232] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] transition-transform select-none shrink-0"
        title="POPURRÍ — Identidad Gráfica Oficial"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="65 40 1135 335"
          role="img"
          aria-label="POPURRÍ"
          className={className}
        >
          <g id="Sombra_3D_Petroleo" transform="translate(8, 28)">
            <path fill="#25323A" fillRule="evenodd" d={PATH_SOMBRA_Y_FILETE} />
          </g>
          <g id="Filete_Rojo_Popurri" transform="translate(26, 4)">
            <path fill="#FF2C00" fillRule="evenodd" d={PATH_SOMBRA_Y_FILETE} />
          </g>
          <g id="Relleno_Amarillo_Popurri" transform="translate(26, 4)">
            <path fill="#FFF06B" fillRule="evenodd" d={PATH_RELLENO_AMARILLO} />
          </g>
        </svg>
      </div>
    </>
  );
};
