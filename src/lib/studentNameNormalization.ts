/** Vietnamese display-name normalization, not identity verification or spelling inference. */
export function formatStudentName(value:string):string {
  return value.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('vi-VN')
    .replace(/(^|[\s\-’'])(\p{L})/gu,(_,separator:string,letter:string)=>separator+letter.toLocaleUpperCase('vi-VN'));
}
export function isFullStudentName(value:string):boolean {
  const name=formatStudentName(value);
  return name.length<=160 && name.split(' ').length>=2 && /^[\p{L}\p{M}]+(?:[ '\-’][\p{L}\p{M}]+)+$/u.test(name);
}
