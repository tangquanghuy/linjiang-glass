const TRAVEL_MODE_LABEL = {
  walk: '\u6b65\u884c',
  car: '\u9a7e\u8f66',
  taxi: '\u51fa\u79df\u8f66',
  transit: '\u5730\u94c1\u4ea4\u901a',
};

export function formatTravelMessage(travel) {
  const km = Number(travel?.km);
  const min = Number(travel?.min);
  const yuan = Number(travel?.yuan);
  const stamina = Number(travel?.stamina);
  const from = travel?.fromName || travel?.from || '\u5f53\u524d\u4f4d\u7f6e';
  const to = travel?.toName || travel?.to || '\u76ee\u7684\u5730';
  const mode = TRAVEL_MODE_LABEL[travel?.mode] || travel?.modeLabel || '\u516c\u5171\u4ea4\u901a';
  const distance = Number.isFinite(km) ? `${km} km` : '\u8ddd\u79bb\u672a\u77e5';
  const duration = Number.isFinite(min) ? `${min} \u5206` : '\u8017\u65f6\u672a\u77e5';
  const fare = Number.isFinite(yuan) ? `\u00a5 ${yuan}` : '\u8d39\u7528\u672a\u77e5';
  const energy = Number.isFinite(stamina) ? `\u2212${stamina}` : '\u672a\u77e5';
  const legs = Array.isArray(travel?.legs) ? travel.legs.map((leg) => {
    const carrier = leg?.carrier;
    if (carrier === 'rail') {
      const line = leg.lineName || '\u5730\u94c1';
      const stops = Number(leg.stops);
      const stopText = Number.isFinite(stops) ? ` ${stops} \u7ad9` : '';
      return `${line}${leg.fromLabel || ''} \u2192 ${leg.toLabel || ''}${stopText}\uff0c${leg.min || 0} \u5206`;
    }
    const label = ({
      bus: '\u516c\u4ea4', foot: '\u6b65\u884c', taxi: '\u51fa\u79df\u8f66', car: '\u9a7e\u8f66',
    }[carrier]) || leg?.label || '\u79fb\u52a8';
    const legKm = Number(leg?.km);
    const kmText = Number.isFinite(legKm) ? ` ${legKm} km` : '';
    return `${label}${kmText}\uff0c${leg?.min || 0} \u5206`;
  }).join('\uff1b') : '';

  return [
    `\u51fa\u53d1\uff0c\u4ece ${from} \u5230 ${to}\uff0c\u9014\u7ecf ${distance}\uff0c\u901a\u52e4\u65b9\u5f0f\uff1a${mode}\uff0c\u8017\u65f6\uff1a${duration}\u3002`,
    legs ? `\u8def\u7ebf\uff1a${legs}\u3002` : '',
    `\u8def\u8d39\u82b1\u8d39${fare}\uff0c\u4f53\u529b ${energy}\u3002`,
  ].filter(Boolean).join('\n');
}
