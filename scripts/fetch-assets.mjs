#!/usr/bin/env node
// 코드모스 에셋 창고에서 이 게임이 사용하는 파일을 src/assets/codmos/로 내려받는다.
// 사용법: node scripts/fetch-assets.mjs
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://codmos-creator-studio.bm33728090.chatgpt.site'
const OUT = path.resolve('src/assets/codmos')

export const ASSETS = {
  'plant_daisy_1.svg': 'f741525cadc27136b90e5870c257648f7ab43566739def53fd878182d8a86da3',
  'plant_daisy_2.svg': '7c2b16045449ac003d74f834f932e7aa83dc24916e8807aac812f664b8902a27',
  'plant_daisy_3.svg': '09bbaf7ffeb15db7e4835b1e4a03d1052398edcd12f068c41fd408c00befe09b',
  'plant_strawberry_1.svg': '0d2cc9be0915877723b2804a96b86c5d0b102ba0c9e29bfebe4bd7a5f9efee7f',
  'plant_strawberry_2.svg': 'cb2218f0df5dab0ad0b293f2e64b0631a68d308bfe5757e0d370d21bac94008d',
  'plant_strawberry_3.svg': 'cc22b97cd371463d957109972075f36172fe509947d9fbd7cbce73b183623c11',
  'plant_sunflower_1.svg': '709009b77591dbeb9bdea4f7a4b02ff865075f66409df0dd33fa3564a9ec24ad',
  'plant_sunflower_2.svg': '68809475777a2743e43342a6b2a68d8e0600f5195393c34348981d476534fd26',
  'plant_sunflower_3.svg': 'a609f3600dda2986c13700f8b37d6a814a2ad01fc0167e3bda85d106d809da80',
  'plant_tomato_1.svg': 'dc55ac563007d3161a4a871153c5f882973bc59bfdf06f0d7048a5090a8a16a3',
  'plant_tomato_2.svg': '2b5077464d53585f9f214c41946ee32e63deba24e5a701c868c243a54a12b051',
  'plant_tomato_3.svg': 'edb4e4094222892dc1a9d61aab9abd70f6e27b57e9622e4c0eff86d4bafc44fd',
  'plant_tulip_1.svg': 'd64b5d546aa69dc2bdc3092283b11046f5b8912064c9a4596e8eedac5366b497',
  'plant_tulip_2.svg': '6b9b3f558085ed52cc69db244538e3363c2018d5882a14ec8ef34953b0f367ee',
  'plant_tulip_3.svg': 'cf4502a969ee32e6e8f88db173feb5aebb90842cca8db6f9fc0731ecb739ba7b',
  'seed.svg': '64a43e4def4bd438d54bb47de68e3ccf8f6616785a6fb4aa580e4576422de29c',
  'pot_body.svg': 'd3d36fc172b808a5038a5e22f97602614f1899370eec26631549b1fb712087dc',
  'pot_shadow.svg': '7721e2ab2830cabb86759405ea7bc6edac908eade610c762bc506410eb5e20c7',
  'drop.svg': 'a2bd795dae3577e9196696f83a9bfe7c297392d19ca2ae980a0188c534eee3a1',
  'drone_1_idle.svg': '9d156b0357dc1455eae0573327f5adbe69c57ffc9cc74798a4c7fec67c483937',
  'drone_1_loaded.svg': '4e41383673ce98330bf2e1878c99c55b951038b9e28b6c1c75738bf72e6fa987',
  'crate_strawberry.svg': 'f738a36603c9b51e45ca3805880e8e039132546f5668751aca50bdfb1c4a3e94',
  'crate_lemon.svg': 'a97d197fa4b8da33684af8a4fe0cb1b4e7b6c82d64ed35cf85787497b4ecae03',
  'crate_peach.svg': 'ed3d80cddf6ffbb60e73f58421cf9c665223b6219d8c2859ce3dcdb6facb2ec5',
  'crate_apple.svg': '3a54dbd65d92d4b9c73882e5a26e52d89434b1a3fc9ef01c1bda7538a3731076',
  'crate_orange.svg': '8c6d74e273b2d164ebaf506a49ae56d93ddb379b72daeb6533ad66ccf350780b',
  'crate_grapes.svg': 'd87eccf194bc2d7c3c3af090437d3bf510ca6e9b695be677e0eb7f3e93b12906',
  'crate_pineapple.svg': '20065f58d2414d83cea3b6b9535a1300300e75e33b5ae1725c8ae3c9dfe1efff',
  'crate_watermelon.svg': 'f4087d54be5a4dfe9bf97f9d1e6908f941cf560747f44e039a4b4216af1a3696',
  'truck_closed.svg': '42305dcf28ca253e49c5c5e77b84979c78bdb69853e84d0b8c2dbfb716992179',
  'truck_open.svg': '8aebb12e0c9caa0d2175d2faf62d32c9f6876fa777f75e349d236ee6348c310c',
  'char_1_int_idle.svg': 'b42e3604fb07375dc4824da2431542152a6155a3def1201c0c41c98f839a9fb1',
  'char_1_int_action.svg': '531015efe7cb9e151a614f7d2aa7ef3675f560490f30678ca42fe5cbda3f35d8',
  'SFX_Click_01.mp3': '8c0ea0734e3073c893bd5d9d0db18ce87c784e66686a5b5fbea1c2a93cfdab6b',
  'SFX_Drop.mp3': '5c10e8b8ddcf2c1d973eb625731d51d123186e11f99df1a20dce61a117e21d74',
  'SFX_Drag.mp3': 'dfa93a460389213375db605ee64deec812a9a80362b84fb6e468e6e738025e36',
  'SFX_Fail.mp3': '8bb3839da609ca5084246b7eb343a05fa7e71fe7e34f7c20606c2b342aefcdc8',
  'SFX_Success.mp3': '794bee61eba7ff9b88cc58709b45a6c7446b02016a16d68c829cfb29cfddb3ff',
  'SFX_Pannel_Open.mp3': '09c95c974514c9f227f8b56a7cde2e79ee5ae85f72f13fd40a2a9497906028c0',
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(OUT, { recursive: true })
  for (const [name, id] of Object.entries(ASSETS)) {
    const res = await fetch(`${BASE}/file/${id}?download=1`, { headers: { 'User-Agent': 'CodmosAgent/1.0' } })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await res.arrayBuffer()))
    console.log(`${name} (${res.headers.get('content-length') ?? '?'} bytes)`)
  }
}
