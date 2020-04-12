import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap } from 'rxjs/operators'
import { BehaviorSubject, Observable } from 'rxjs';
import { sortBy, uniqBy } from 'lodash';

import { SharedService } from './shared.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private _id: number = 405;

  private dataSource = new BehaviorSubject(false);
  private refreshSource = new BehaviorSubject(false);
  data = this.dataSource.asObservable();
  refresh = this.refreshSource.asObservable();

  constructor(
    private http: HttpClient,
    private shared: SharedService
  ) { }

  get id() { return this._id; }
  set id(id: number) { this._id = id } 

  updatedDataSelection(data: boolean, config: number = 1){
    if (!data) {
      if (config === 1) return;
      this.refreshSource.next(!data);
    } else {
      this.dataSource.next(data);
    }
  }

  character(id: number) {
    return this.http.get(`https://kitsu.io/api/edge/characters/${id}`).pipe(
      map((res) => res['data']),
      map((res) => {
        delete res['attributes']['createdAt']
        delete res['attributes']['updatedAt']
        delete res['attributes']['image']
        delete res['attributes']['malId']
        return { 
          id,
          ...res['attributes'], 
          manga: res['relationships']['castings']['links']['self'], 
          anime: res['relationships']['mediaCharacters']['links']['self'] 
        };
      })
    );
  }

  manga(character: Observable<any>) {
    return character.pipe(
      mergeMap((res) => {
        return this.http.get(res['manga']).pipe(
          map((d) => {
            return sortBy(d['data'].map((a) => {
              a['id'] = +a['id'];
              return a;
            }), [ 'id' ])
          }),
          map((d) => d.map((e) => 
            this.http.get(`https://kitsu.io/api/edge/castings/${e['id']}/media`) )),
          map((manga) => ({ ...res, manga }))
        )
      }),
    )
  }

  anime(character: Observable<any>) {
    return character.pipe(
      mergeMap((res) => {
        return this.http.get(res['anime']).pipe(
          map((d) => {
            return sortBy(d['data'].map((a) => {
              a['id'] = +a['id'];
              return a;
            }), [ 'id' ]).reverse()
          }), 
          map((d) => d.map((e) =>
            this.http.get(`https://kitsu.io/api/edge/media-characters/${e['id']}/media`))),
          map((anime) => ({ ...res, anime }))
        )
      }),
    )
  }

  media(docs: Observable<any>[]) {

    const length = docs.length;
    let count = 0;
    let media = []

    const observable = new Observable((subscriber) => {
      docs.forEach((media) => subscriber.next(media));
      subscriber.complete();
    });

    const pipe = observable.pipe(
      mergeMap((e: any) => e),
      map(e => e['data'])
    ).subscribe((res) => {
      count++;
      res = { ...res['attributes'], relationships: res['relationships'] };
      media.push(res);
      if (count === length) {
        
        media = uniqBy(media.map((e) => {
          e['key'] = e['titles']['en_jp'];
          return e
        }), 'key')

        this.shared.updatedMediaSelection = media;
        pipe.unsubscribe();
      }
    });
    
  }

  characters(option: { next: boolean }) {
   
    if (option.next) {
      const id = this.id + 20;
      this.id = id < 901 ? id : this.id;
    }

    const offset = this.id < 884 ? 20 : 15;
    const root = 'https://kitsu.io/api/edge/characters';
    const config = `?page%5Blimit%5D=${offset}&page%5Boffset%5D=`;
    const link = `${root}${config}${this.id}`;

    return { data: this.http.get(link).pipe(
      map((offset: any) => 
        offset['data'].map(e => 
          ({ id: +e['id'], name: e['attributes']['canonicalName'] })  
        )
      )
    ), id: this.id };
  }

  get freshLoad() {
    this.id = 405;
    const link = 'https://kitsu.io/api/edge/characters?page%5Blimit%5D=20&page%5Boffset%5D=405';
    return this.http.get(link).pipe(
      map((offset: any) => 
        offset['data'].map(e => 
          ({ id: +e['id'], name: e['attributes']['canonicalName'] })  
        )
      )
    )
  }

}