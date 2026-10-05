import { ref } from 'vue';

export const toastMessage = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  toastMessage.value = msg;
  clearTimeout(timer);
  timer = setTimeout(() => (toastMessage.value = ''), 3500);
}
