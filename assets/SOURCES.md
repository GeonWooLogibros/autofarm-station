# 에셋 출처

이 게임은 두 곳에서 받은 에셋을 사용합니다. 온실 장면의 그림과 효과음은 코드모스 에셋 창고에서 받았고, 화면의 틀과 단추와 아이콘은 Kenney의 묶음에서 받았습니다. Kenney의 에셋은 이 문서의 마지막 절에 따로 정리했습니다.

## 코드모스 에셋

온실 장면의 그림과 소리는 코드모스 에셋 창고(`https://codmos-creator-studio.bm33728090.chatgpt.site`)에서 내려받은 파일입니다.
파일은 `src/assets/codmos/`에 있으며, 다음 명령으로 다시 내려받을 수 있습니다.

```bash
node scripts/fetch-assets.mjs
```

내려받기 주소는 `https://codmos-creator-studio.bm33728090.chatgpt.site/file/<에셋 ID>?download=1`이고, 요청 헤더에 `User-Agent: CodmosAgent/1.0`이 필요합니다.
내려받은 파일은 SVG 33개와 MP3 6개로 모두 39개입니다. SVG는 안전 검사(`<script`, `on…=` 속성, 외부 주소를 가리키는 `href`)를 거쳤고 걸린 파일이 없어서, 모든 파일을 원본 그대로 사용합니다.

### 파일 목록

원본 묶음은 수학 P950, P352, P439, P45와 수학 사운드입니다. 식물 15개와 씨앗, 화분, 화분 그림자, 물방울은 P950, 드론 2개는 P352, 상자 8개와 트럭 2개는 P439, 인트 2개는 P45, 효과음 6개는 사운드 묶음입니다.

| 파일 이름 | 원본 묶음 | 에셋 ID | 내려받기 주소 | 게임에서 쓰는 곳 | 수정 내용 |
| --- | --- | --- | --- | --- | --- |
| `plant_daisy_1.svg` | 수학 P950 | `f741525cadc27136b90e5870c257648f7ab43566739def53fd878182d8a86da3` | `/file/f741525cadc27136b90e5870c257648f7ab43566739def53fd878182d8a86da3?download=1` | daisy 식물 1단계(PLANT_SPRITES) | 없음 |
| `plant_daisy_2.svg` | 수학 P950 | `7c2b16045449ac003d74f834f932e7aa83dc24916e8807aac812f664b8902a27` | `/file/7c2b16045449ac003d74f834f932e7aa83dc24916e8807aac812f664b8902a27?download=1` | daisy 식물 2단계(PLANT_SPRITES) | 없음 |
| `plant_daisy_3.svg` | 수학 P950 | `09bbaf7ffeb15db7e4835b1e4a03d1052398edcd12f068c41fd408c00befe09b` | `/file/09bbaf7ffeb15db7e4835b1e4a03d1052398edcd12f068c41fd408c00befe09b?download=1` | daisy 식물 3단계(PLANT_SPRITES) | 없음 |
| `plant_strawberry_1.svg` | 수학 P950 | `0d2cc9be0915877723b2804a96b86c5d0b102ba0c9e29bfebe4bd7a5f9efee7f` | `/file/0d2cc9be0915877723b2804a96b86c5d0b102ba0c9e29bfebe4bd7a5f9efee7f?download=1` | strawberry 식물 1단계(PLANT_SPRITES) | 없음 |
| `plant_strawberry_2.svg` | 수학 P950 | `cb2218f0df5dab0ad0b293f2e64b0631a68d308bfe5757e0d370d21bac94008d` | `/file/cb2218f0df5dab0ad0b293f2e64b0631a68d308bfe5757e0d370d21bac94008d?download=1` | strawberry 식물 2단계(PLANT_SPRITES) | 없음 |
| `plant_strawberry_3.svg` | 수학 P950 | `cc22b97cd371463d957109972075f36172fe509947d9fbd7cbce73b183623c11` | `/file/cc22b97cd371463d957109972075f36172fe509947d9fbd7cbce73b183623c11?download=1` | strawberry 식물 3단계(PLANT_SPRITES) | 없음 |
| `plant_sunflower_1.svg` | 수학 P950 | `709009b77591dbeb9bdea4f7a4b02ff865075f66409df0dd33fa3564a9ec24ad` | `/file/709009b77591dbeb9bdea4f7a4b02ff865075f66409df0dd33fa3564a9ec24ad?download=1` | sunflower 식물 1단계(PLANT_SPRITES) | 없음 |
| `plant_sunflower_2.svg` | 수학 P950 | `68809475777a2743e43342a6b2a68d8e0600f5195393c34348981d476534fd26` | `/file/68809475777a2743e43342a6b2a68d8e0600f5195393c34348981d476534fd26?download=1` | sunflower 식물 2단계(PLANT_SPRITES) | 없음 |
| `plant_sunflower_3.svg` | 수학 P950 | `a609f3600dda2986c13700f8b37d6a814a2ad01fc0167e3bda85d106d809da80` | `/file/a609f3600dda2986c13700f8b37d6a814a2ad01fc0167e3bda85d106d809da80?download=1` | sunflower 식물 3단계(PLANT_SPRITES) | 없음 |
| `plant_tomato_1.svg` | 수학 P950 | `dc55ac563007d3161a4a871153c5f882973bc59bfdf06f0d7048a5090a8a16a3` | `/file/dc55ac563007d3161a4a871153c5f882973bc59bfdf06f0d7048a5090a8a16a3?download=1` | tomato 식물 1단계(PLANT_SPRITES) | 없음 |
| `plant_tomato_2.svg` | 수학 P950 | `2b5077464d53585f9f214c41946ee32e63deba24e5a701c868c243a54a12b051` | `/file/2b5077464d53585f9f214c41946ee32e63deba24e5a701c868c243a54a12b051?download=1` | tomato 식물 2단계(PLANT_SPRITES) | 없음 |
| `plant_tomato_3.svg` | 수학 P950 | `edb4e4094222892dc1a9d61aab9abd70f6e27b57e9622e4c0eff86d4bafc44fd` | `/file/edb4e4094222892dc1a9d61aab9abd70f6e27b57e9622e4c0eff86d4bafc44fd?download=1` | tomato 식물 3단계(PLANT_SPRITES) | 없음 |
| `plant_tulip_1.svg` | 수학 P950 | `d64b5d546aa69dc2bdc3092283b11046f5b8912064c9a4596e8eedac5366b497` | `/file/d64b5d546aa69dc2bdc3092283b11046f5b8912064c9a4596e8eedac5366b497?download=1` | tulip 식물 1단계(PLANT_SPRITES) | 없음 |
| `plant_tulip_2.svg` | 수학 P950 | `6b9b3f558085ed52cc69db244538e3363c2018d5882a14ec8ef34953b0f367ee` | `/file/6b9b3f558085ed52cc69db244538e3363c2018d5882a14ec8ef34953b0f367ee?download=1` | tulip 식물 2단계(PLANT_SPRITES) | 없음 |
| `plant_tulip_3.svg` | 수학 P950 | `cf4502a969ee32e6e8f88db173feb5aebb90842cca8db6f9fc0731ecb739ba7b` | `/file/cf4502a969ee32e6e8f88db173feb5aebb90842cca8db6f9fc0731ecb739ba7b?download=1` | tulip 식물 3단계(PLANT_SPRITES) | 없음 |
| `seed.svg` | 수학 P950 | `64a43e4def4bd438d54bb47de68e3ccf8f6616785a6fb4aa580e4576422de29c` | `/file/64a43e4def4bd438d54bb47de68e3ccf8f6616785a6fb4aa580e4576422de29c?download=1` | 씨앗(SEED_SPRITE) | 없음 |
| `pot_body.svg` | 수학 P950 | `d3d36fc172b808a5038a5e22f97602614f1899370eec26631549b1fb712087dc` | `/file/d3d36fc172b808a5038a5e22f97602614f1899370eec26631549b1fb712087dc?download=1` | 화분 몸체(POT_SPRITE) | 없음 |
| `pot_shadow.svg` | 수학 P950 | `7721e2ab2830cabb86759405ea7bc6edac908eade610c762bc506410eb5e20c7` | `/file/7721e2ab2830cabb86759405ea7bc6edac908eade610c762bc506410eb5e20c7?download=1` | 화분 그림자(POT_SHADOW_SPRITE) | 없음 |
| `drop.svg` | 수학 P950 | `a2bd795dae3577e9196696f83a9bfe7c297392d19ca2ae980a0188c534eee3a1` | `/file/a2bd795dae3577e9196696f83a9bfe7c297392d19ca2ae980a0188c534eee3a1?download=1` | 물방울(DROP_SPRITE) | 없음 |
| `drone_1_idle.svg` | 수학 P352 | `9d156b0357dc1455eae0573327f5adbe69c57ffc9cc74798a4c7fec67c483937` | `/file/9d156b0357dc1455eae0573327f5adbe69c57ffc9cc74798a4c7fec67c483937?download=1` | 드론 기본 모습(DRONE_SPRITES.idle) | 없음 |
| `drone_1_loaded.svg` | 수학 P352 | `4e41383673ce98330bf2e1878c99c55b951038b9e28b6c1c75738bf72e6fa987` | `/file/4e41383673ce98330bf2e1878c99c55b951038b9e28b6c1c75738bf72e6fa987?download=1` | 상자를 든 드론(DRONE_SPRITES.loaded) | 없음 |
| `crate_strawberry.svg` | 수학 P439 | `f738a36603c9b51e45ca3805880e8e039132546f5668751aca50bdfb1c4a3e94` | `/file/f738a36603c9b51e45ca3805880e8e039132546f5668751aca50bdfb1c4a3e94?download=1` | strawberry 상자(CRATE_SPRITES) | 없음 |
| `crate_lemon.svg` | 수학 P439 | `a97d197fa4b8da33684af8a4fe0cb1b4e7b6c82d64ed35cf85787497b4ecae03` | `/file/a97d197fa4b8da33684af8a4fe0cb1b4e7b6c82d64ed35cf85787497b4ecae03?download=1` | lemon 상자(CRATE_SPRITES) | 없음 |
| `crate_peach.svg` | 수학 P439 | `ed3d80cddf6ffbb60e73f58421cf9c665223b6219d8c2859ce3dcdb6facb2ec5` | `/file/ed3d80cddf6ffbb60e73f58421cf9c665223b6219d8c2859ce3dcdb6facb2ec5?download=1` | peach 상자(CRATE_SPRITES) | 없음 |
| `crate_apple.svg` | 수학 P439 | `3a54dbd65d92d4b9c73882e5a26e52d89434b1a3fc9ef01c1bda7538a3731076` | `/file/3a54dbd65d92d4b9c73882e5a26e52d89434b1a3fc9ef01c1bda7538a3731076?download=1` | apple 상자(CRATE_SPRITES) | 없음 |
| `crate_orange.svg` | 수학 P439 | `8c6d74e273b2d164ebaf506a49ae56d93ddb379b72daeb6533ad66ccf350780b` | `/file/8c6d74e273b2d164ebaf506a49ae56d93ddb379b72daeb6533ad66ccf350780b?download=1` | orange 상자(CRATE_SPRITES) | 없음 |
| `crate_grapes.svg` | 수학 P439 | `d87eccf194bc2d7c3c3af090437d3bf510ca6e9b695be677e0eb7f3e93b12906` | `/file/d87eccf194bc2d7c3c3af090437d3bf510ca6e9b695be677e0eb7f3e93b12906?download=1` | grapes 상자(CRATE_SPRITES) | 없음 |
| `crate_pineapple.svg` | 수학 P439 | `20065f58d2414d83cea3b6b9535a1300300e75e33b5ae1725c8ae3c9dfe1efff` | `/file/20065f58d2414d83cea3b6b9535a1300300e75e33b5ae1725c8ae3c9dfe1efff?download=1` | pineapple 상자(CRATE_SPRITES) | 없음 |
| `crate_watermelon.svg` | 수학 P439 | `f4087d54be5a4dfe9bf97f9d1e6908f941cf560747f44e039a4b4216af1a3696` | `/file/f4087d54be5a4dfe9bf97f9d1e6908f941cf560747f44e039a4b4216af1a3696?download=1` | watermelon 상자(CRATE_SPRITES) | 없음 |
| `truck_closed.svg` | 수학 P439 | `42305dcf28ca253e49c5c5e77b84979c78bdb69853e84d0b8c2dbfb716992179` | `/file/42305dcf28ca253e49c5c5e77b84979c78bdb69853e84d0b8c2dbfb716992179?download=1` | 문 닫힌 트럭(TRUCK_SPRITES.closed) | 없음 |
| `truck_open.svg` | 수학 P439 | `8aebb12e0c9caa0d2175d2faf62d32c9f6876fa777f75e349d236ee6348c310c` | `/file/8aebb12e0c9caa0d2175d2faf62d32c9f6876fa777f75e349d236ee6348c310c?download=1` | 문 열린 트럭(TRUCK_SPRITES.open) | 없음 |
| `char_1_int_idle.svg` | 수학 P45 | `b42e3604fb07375dc4824da2431542152a6155a3def1201c0c41c98f839a9fb1` | `/file/b42e3604fb07375dc4824da2431542152a6155a3def1201c0c41c98f839a9fb1?download=1` | 인트 기본 모습(INT_SPRITES.idle) | 없음 |
| `char_1_int_action.svg` | 수학 P45 | `531015efe7cb9e151a614f7d2aa7ef3675f560490f30678ca42fe5cbda3f35d8` | `/file/531015efe7cb9e151a614f7d2aa7ef3675f560490f30678ca42fe5cbda3f35d8?download=1` | 인트 동작 모습(INT_SPRITES.action) | 없음 |
| `SFX_Click_01.mp3` | 수학 사운드 | `8c0ea0734e3073c893bd5d9d0db18ce87c784e66686a5b5fbea1c2a93cfdab6b` | `/file/8c0ea0734e3073c893bd5d9d0db18ce87c784e66686a5b5fbea1c2a93cfdab6b?download=1` | 실행 단추를 누르는 소리(SOUNDS.click) | 없음 |
| `SFX_Drop.mp3` | 수학 사운드 | `5c10e8b8ddcf2c1d973eb625731d51d123186e11f99df1a20dce61a117e21d74` | `/file/5c10e8b8ddcf2c1d973eb625731d51d123186e11f99df1a20dce61a117e21d74?download=1` | 심기 소리(SOUNDS.plant), 물주기 소리(SOUNDS.water) | 없음 |
| `SFX_Drag.mp3` | 수학 사운드 | `dfa93a460389213375db605ee64deec812a9a80362b84fb6e468e6e738025e36` | `/file/dfa93a460389213375db605ee64deec812a9a80362b84fb6e468e6e738025e36?download=1` | 수확 소리(SOUNDS.harvest) | 없음 |
| `SFX_Fail.mp3` | 수학 사운드 | `8bb3839da609ca5084246b7eb343a05fa7e71fe7e34f7c20606c2b342aefcdc8` | `/file/8bb3839da609ca5084246b7eb343a05fa7e71fe7e34f7c20606c2b342aefcdc8?download=1` | 코드 오류 소리(SOUNDS.fail) | 없음 |
| `SFX_Success.mp3` | 수학 사운드 | `794bee61eba7ff9b88cc58709b45a6c7446b02016a16d68c829cfb29cfddb3ff` | `/file/794bee61eba7ff9b88cc58709b45a6c7446b02016a16d68c829cfb29cfddb3ff?download=1` | 해금 소리(SOUNDS.unlock) | 없음 |
| `SFX_Pannel_Open.mp3` | 수학 사운드 | `09c95c974514c9f227f8b56a7cde2e79ee5ae85f72f13fd40a2a9497906028c0` | `/file/09c95c974514c9f227f8b56a7cde2e79ee5ae85f72f13fd40a2a9497906028c0?download=1` | 패널 열림 소리(SOUNDS.panel) | 없음 |

### 배치 메모

그림을 PNG로 바꿔 눈으로 확인한 내용입니다. 크기는 SVG의 `viewBox`(너비 x 높이)입니다. 단위는 SVG 픽셀입니다.

- 식물: 화분이 포함되어 있지 않습니다. 줄기와 잎, 열매만 그려진 그림이므로 화분은 `pot_body.svg`와 `pot_shadow.svg`로 따로 그려야 합니다. 여백 없이 내용에 맞게 잘려 있어서, 그림의 아랫변이 줄기 밑동이며 이것이 시각적 기준선입니다. 선반 칸에 놓을 때는 화분 윗면 중앙에 아랫변 중앙을 맞춥니다.
- 식물 크기(너비 x 높이)는 단계가 오를수록 커집니다. 모든 크기가 작아서 확대해서 그려야 합니다.
  - 데이지: 21x11, 26x23, 45x34
  - 딸기: 17x12, 30x19, 51x32
  - 해바라기: 22x12, 28x30, 30x41
  - 토마토: 16x10, 31x24, 39x35
  - 튤립: 11x10, 22x28, 27x38
- 씨앗: 5x4로 매우 작습니다. 흙 위에 놓는 점처럼 쓰며, 아랫변을 기준선으로 삼습니다.
- 화분: 몸체는 43x38이며 위쪽에 짙은 흙 구멍이 보이고 아래쪽이 좁아지는 통입니다. 아랫변이 기준선이고 윗면 중앙이 식물을 놓는 자리입니다. 그림자는 36x14의 타원이며 화분 아래에 깔아 사용합니다.
- 물방울: 21x31이며 위가 뾰족한 청색 방울입니다.
- 드론: 기본 모습은 158x112, 상자를 든 모습은 158x137입니다. 상자를 든 모습은 위쪽에 상자가 얹혀 있어서 높이가 25만큼 큽니다. 아랫변이 착륙 다리 끝이며 그림자는 없습니다. 몸체 색은 청록색과 흰색입니다. 프로펠러는 네 개이고, 몸체 양옆 위쪽에 둘씩 있습니다. 기본 모습에서 대략 너비 기준 왼쪽 0.10과 0.07, 오른쪽 0.85와 0.93 위치에, 높이 기준 0.17과 0.30 위치에 있습니다(왼쪽 위 0.10/0.17, 왼쪽 아래 0.07/0.30, 오른쪽 위 0.85/0.17, 오른쪽 아래 0.93/0.30). 상자를 든 모습에서는 높이가 커진 만큼 세로 분수가 작아지며 높이 기준 0.18과 0.32 근처입니다. 눈대중이므로 회전 표시를 덧그릴 때 화면에서 맞춰 보아야 합니다.
- 상자: 8종 모두 160x94이고 상자 틀의 크기가 같습니다. 겉보기 크기는 담긴 과일 크기로 구분되며, 눈으로 본 순서는 기본 순서(딸기, 레몬, 복숭아, 사과, 오렌지, 포도, 파인애플, 수박)와 어긋나지 않아 기본 순서를 그대로 썼습니다. 다만 크기 차이는 작습니다. 사과 그림에만 바닥 그림자가 있습니다.
- 트럭: 열린 것과 닫힌 것 모두 280x286입니다. 뒷면 문이 보이는 모습이며, 열린 것은 짐칸 안이 보이고 닫힌 것은 셔터가 내려와 있습니다. 아래쪽에 타원 그림자가 있습니다.
- 인트(캐릭터): 두 그림 모두 124.4x124.4이고, 기본 모습은 광선검을 든 채 서 있고 동작 모습은 휘두르는 자세입니다. 발밑에 그림자가 있으며 기준선은 그림자의 아랫변입니다. `viewBox`의 시작 좌표가 원본 시트 안의 위치(137.78, 0.37과 137.78, 157.35)이므로 그대로 `<img>`에 쓰면 되고 좌표를 따로 옮길 필요는 없습니다.

## Kenney 에셋 (화면 틀, 단추, 아이콘)

제어반처럼 보이는 화면의 틀과 단추, 막대, 상태등, 아이콘은 Kenney(`https://kenney.nl`)가 배포하는 게임용 무료 묶음 두 개에서 가져왔습니다. 두 묶음은 모두 CC0(Creative Commons Zero, `http://creativecommons.org/publicdomain/zero/1.0/`)으로 배포되므로, 출처를 밝히지 않아도 개인용과 상업용으로 자유롭게 사용할 수 있습니다. 이 문서에는 출처를 확인할 수 있도록 기록해 둡니다.

| 묶음 | 소개 페이지 | 판 | 라이선스 |
| --- | --- | --- | --- |
| UI Pack: Sci-Fi | `https://kenney.nl/assets/ui-pack-sci-fi` | 2.0 (2024-08-19) | CC0 |
| Game Icons | `https://kenney.nl/assets/game-icons` | 묶음에 판 번호가 적혀 있지 않습니다. | CC0 |

파일은 `src/assets/kenney/`에 있으며, 다음 명령으로 다시 받을 수 있습니다. 이 명령은 소개 페이지에서 묶음(zip)의 주소를 찾아 임시 폴더에 내려받은 다음, 아래 표에 적힌 파일만 내용 그대로 꺼내 옵니다. 묶음에 들어 있는 다른 파일은 저장소에 넣지 않았습니다.

```bash
node scripts/fetch-kenney.mjs
```

작업할 때 받은 묶음의 주소는 `https://kenney.nl/media/pages/assets/ui-pack-sci-fi/b67c2acd31-1724181109/kenney_ui-pack-space-expansion.zip`과 `https://kenney.nl/media/pages/assets/game-icons/1ebf9c14af-1677661579/kenney_game-icons.zip`입니다.

### 파일 목록

파일의 내용은 고치지 않았습니다. 색은 화면에서 CSS 필터로만 입힙니다. 회색 틀과 단추에는 `src/ui/chrome.ts`가 만드는 필터(`#tint-panel`, `#tint-screen`, `#tint-steel`, `#tint-primary`, `#tint-warn`)를 적용해 남색과 청록색, 주황색으로 바꾸고, 파란 막대와 색이 있는 상태등에는 `hue-rotate`를 적용해 게임의 청록색과 주황색에 맞춥니다. 같은 이름의 파일이 색마다 따로 있는 경우에는 저장할 때 이름 앞에 색 이름을 붙였습니다.

| 저장한 이름 | 묶음 | 묶음 안의 경로 | 게임에서 쓰는 곳 | 수정 내용 |
| --- | --- | --- | --- | --- |
| `panel_glass_screws.svg` | UI Pack: Sci-Fi | `Vector/Extra/panel_glass_screws.svg` | 터미널, 온실 화면, 해금·설명서·설정·엔딩 화면, 안내 말풍선의 틀(`.frame`) | 없음 |
| `panel_glass.svg` | UI Pack: Sci-Fi | `Vector/Extra/panel_glass.svg` | 편집기와 기록 칸처럼 안으로 들어간 화면의 틀(`.screen`) | 없음 |
| `button_rectangle_depth.svg` | UI Pack: Sci-Fi | `Vector/Extra/button_rectangle_depth.svg` | 모든 단추의 기본 모습(`.btn`) | 없음 |
| `button_rectangle.svg` | UI Pack: Sci-Fi | `Vector/Extra/button_rectangle.svg` | 단추를 누르고 있는 동안의 모습 | 없음 |
| `blue_bar_square_gloss_large.svg` | UI Pack: Sci-Fi | `Vector/Blue/bar_square_gloss_large.svg` | 상단의 제목 판, 해금 화면의 진행 막대 | 이름만 변경 |
| `bar_shadow_square_outline_large.svg` | UI Pack: Sci-Fi | `Vector/Extra/bar_shadow_square_outline_large.svg` | 해금 화면의 진행 막대가 놓이는 홈 | 없음 |
| `grey_bar_round_gloss_large_square.svg` | UI Pack: Sci-Fi | `Vector/Grey/bar_round_gloss_large_square.svg` | 터미널의 상태등(대기 중) | 이름만 변경 |
| `green_bar_round_gloss_large_square.svg` | UI Pack: Sci-Fi | `Vector/Green/bar_round_gloss_large_square.svg` | 터미널의 상태등(실행 중) | 이름만 변경 |
| `yellow_bar_round_gloss_large_square.svg` | UI Pack: Sci-Fi | `Vector/Yellow/bar_round_gloss_large_square.svg` | 터미널의 상태등(멈춤) | 이름만 변경 |
| `red_bar_round_gloss_large_square.svg` | UI Pack: Sci-Fi | `Vector/Red/bar_round_gloss_large_square.svg` | 터미널의 상태등(오류). 화면에서는 주황색으로 돌려서 보여 줍니다. | 이름만 변경 |
| `game_icons_sheet_white1x.png` | Game Icons | `Spritesheet/sheet_white1x.png` | 단추와 알림의 아이콘. 그림 한 장에서 50px 칸을 잘라 씁니다(`.ico-*`). | 이름만 변경 |

### 배치 메모

- 틀과 단추는 `border-image`로 아홉 조각을 내어 늘립니다. 원본의 선 두께는 2px이고 모서리의 둥글기는 6px이며, 나사는 모서리에서 8~12px 안쪽에 있습니다. 그래서 `panel_glass_screws.svg`와 단추는 16px, `panel_glass.svg`는 8px, 막대는 6px, 막대의 홈은 4px을 모서리 조각으로 잡았습니다. 화면에서 직접 그리는 선도 이 값에 맞춰 두께 2px, 둥글기 6px로 통일했습니다.
- `button_rectangle_depth.svg`는 아래쪽 4px이 단추의 두께를 나타내는 어두운 단입니다. 누르고 있는 동안에는 두께가 없는 `button_rectangle.svg`로 바꾸고 윗변을 3px 내려서, 단추가 눌린 것처럼 보이게 합니다.
- 아이콘 그림은 1024x512이고 한 칸이 50x50입니다. 사용하는 칸의 자리(왼쪽 위 좌표)는 다음과 같습니다: 실행 `forward` (350, 350), 정지 `stop` (100, 400), 한 단계 `next` (200, 450), 해금 `unlocked` (100, 100), 설명서 `menuList` (250, 250), 설정 `gear` (350, 50), 닫기 `cross` (400, 400), 확인 `checkmark` (450, 0), 경고 `warning` (50, 350), 다시 보기 `return` (200, 50). 좌표는 묶음의 `Spritesheet/sheet_white1x.xml`에 적힌 값입니다.
- 제목과 단추와 숫자에 쓰는 글꼴인 Do Hyeon은 에셋 파일로 넣지 않고 Google Fonts의 스타일시트(`https://fonts.googleapis.com/css2?family=Do+Hyeon`)로 불러옵니다. 이 글꼴은 SIL Open Font License 1.1로 배포됩니다. 글꼴을 받지 못하는 환경에서는 기기에 설치된 글꼴로 표시됩니다.
