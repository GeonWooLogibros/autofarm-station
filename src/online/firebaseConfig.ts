// Firebase 웹 설정값. 비밀 값이 아니므로 저장소에 둔다(보호는 firestore.rules가 맡는다).
// 프로젝트를 만든 뒤 콘솔의 웹 앱 설정에서 값을 복사해 넣는다. null이면 랭킹만 꺼진다.
export interface FirebaseConfig { apiKey: string; authDomain: string; projectId: string; appId: string }

export const FIREBASE_CONFIG: FirebaseConfig | null = null
