/** Tiles from the user-supplied 4 × 3 artwork, kept in one image request. */
export type VintageKind='gate'|'checklist'|'briefcase'|'team'|'desk'|'link'|'badge'|'folder'|'stamp'|'calendar'|'timer'|'reward';
export function VintageIcon({kind,className=''}:{kind:VintageKind;className?:string}){
 return <span className={`vintage-icon vintage-${kind} ${className}`} aria-hidden="true"/>;
}
