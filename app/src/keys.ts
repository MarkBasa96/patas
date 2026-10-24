// Every on-phone storage key that belongs to one user. Sign-out and account deletion remove all of them
// (Kenshin round 4 M-1: the photo row list holds people's names and was missed). A new per-user key goes here.
export const localKey = (uid: string) => `patas.v1.${uid}`;
export const qrRowsKey = (uid: string) => `patas.qr.v1.${uid}`;
export const photoRowsKey = (uid: string) => `patas.photos.v1.${uid}`;

export const userKeys = (uid: string): string[] => [localKey(uid), qrRowsKey(uid), photoRowsKey(uid)];
