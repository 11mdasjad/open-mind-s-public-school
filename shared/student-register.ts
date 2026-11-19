export const schoolClasses = ['Nursery','LKG','UKG',...Array.from({length:7},(_,i)=>`Class ${i+1}`)];
export const classKey = (value = '') => {
  const key = value.trim().toLowerCase().replace(/^(class|grade|standard|std\.?)\s*/, '').replace(/(st|nd|rd|th)$/, '');
  return /^\d+$/.test(key) ? `class-${Number(key)}` : key;
};
export const classLabel = (value: string) => schoolClasses.find(label=>classKey(label)===classKey(value)) || value;
