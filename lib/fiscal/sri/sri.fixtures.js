/**
 * FIXTURES DE PRUEBA — no son respuestas reales del SRI.
 *
 * Los cuerpos de RECIBIDA/DEVUELTA/AUTORIZADO/RECHAZADO reproducen la FORMA exacta de
 * los ejemplos oficiales de la ficha técnica 2.34 (sección 7, ver
 * docs/fiscal/sri-official/ficha_extracted.txt líneas ~840-1000), pero con datos
 * sintéticos. No representan una integración real validada contra el ambiente de
 * Pruebas del SRI — eso solo se confirma ejecutando de verdad contra
 * celcer.sri.gob.ec, algo que este archivo NO hace.
 */

export const FIXTURE_RECIBIDA = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion">
      <RespuestaRecepcionComprobante>
        <estado>RECIBIDA</estado>
        <comprobantes/>
      </RespuestaRecepcionComprobante>
    </ns2:validarComprobanteResponse>
  </soap:Body>
</soap:Envelope>`

export const FIXTURE_DEVUELTA_UN_MENSAJE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion">
      <RespuestaRecepcionComprobante>
        <estado>DEVUELTA</estado>
        <comprobantes>
          <comprobante>
            <claveAcceso>1702201205176001321000110010030001000011234567816</claveAcceso>
            <mensajes>
              <mensaje>
                <identificador>35</identificador>
                <mensaje>DOCUMENTO INVALIDO</mensaje>
                <informacionAdicional>Se encontro un error en la estructura del comprobante.</informacionAdicional>
                <tipo>ERROR</tipo>
              </mensaje>
            </mensajes>
          </comprobante>
        </comprobantes>
      </RespuestaRecepcionComprobante>
    </ns2:validarComprobanteResponse>
  </soap:Body>
</soap:Envelope>`

export const FIXTURE_DEVUELTA_MULTIPLES_MENSAJES = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion">
      <RespuestaRecepcionComprobante>
        <estado>DEVUELTA</estado>
        <comprobantes>
          <comprobante>
            <claveAcceso>1702201205176001321000110010030001000011234567816</claveAcceso>
            <mensajes>
              <mensaje>
                <identificador>35</identificador>
                <mensaje>DOCUMENTO INVALIDO</mensaje>
                <informacionAdicional>Error de estructura.</informacionAdicional>
                <tipo>ERROR</tipo>
              </mensaje>
              <mensaje>
                <identificador>43</identificador>
                <mensaje>SECUENCIAL REGISTRADO</mensaje>
                <informacionAdicional>El secuencial ya fue utilizado.</informacionAdicional>
                <tipo>ERROR</tipo>
              </mensaje>
              <mensaje>
                <identificador>60</identificador>
                <mensaje>ESTE PROCESO FUE REALIZADO EN EL AMBIENTE DE PRUEBAS</mensaje>
                <informacionAdicional></informacionAdicional>
                <tipo>ADVERTENCIA</tipo>
              </mensaje>
            </mensajes>
          </comprobante>
        </comprobantes>
      </RespuestaRecepcionComprobante>
    </ns2:validarComprobanteResponse>
  </soap:Body>
</soap:Envelope>`

export const FIXTURE_SOAP_FAULT = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>Error interno del servicio (fixture de prueba)</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`

export const FIXTURE_MALFORMED = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope><soap:Body><roto`

export const FIXTURE_NOT_XML_AT_ALL = `<html><body>502 Bad Gateway</body></html>`

function fixtureAutorizado({ claveAcceso, numeroAutorizacion = '0503201201176001321000110010030009900641234567814' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <RespuestaAutorizacionComprobante>
        <claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada>
        <numeroComprobantes>1</numeroComprobantes>
        <autorizaciones>
          <autorizacion>
            <estado>AUTORIZADO</estado>
            <numeroAutorizacion>${numeroAutorizacion}</numeroAutorizacion>
            <fechaAutorizacion>2026-08-12T10:00:00.000-05:00</fechaAutorizacion>
            <ambiente>PRUEBAS</ambiente>
            <comprobante><![CDATA[<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.1.0"><!-- FIXTURE, no es un comprobante real --></factura>]]></comprobante>
            <mensajes>
              <mensaje>
                <identificador>60</identificador>
                <mensaje>ESTE PROCESO FUE REALIZADO EN EL AMBIENTE DE PRUEBAS</mensaje>
                <tipo>ADVERTENCIA</tipo>
              </mensaje>
            </mensajes>
          </autorizacion>
        </autorizaciones>
      </RespuestaAutorizacionComprobante>
    </ns2:autorizacionComprobanteResponse>
  </soap:Body>
</soap:Envelope>`
}

function fixtureNoAutorizado({ claveAcceso }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <RespuestaAutorizacionComprobante>
        <claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada>
        <numeroComprobantes>1</numeroComprobantes>
        <autorizaciones>
          <autorizacion>
            <estado>RECHAZADO</estado>
            <fechaAutorizacion>2026-08-12T10:05:00.000-05:00</fechaAutorizacion>
            <ambiente>PRUEBAS</ambiente>
            <comprobante><![CDATA[<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.1.0"><!-- FIXTURE, no es un comprobante real --></factura>]]></comprobante>
            <mensajes>
              <mensaje>
                <identificador>46</identificador>
                <mensaje>RUC no existe</mensaje>
                <tipo>ERROR</tipo>
              </mensaje>
            </mensajes>
          </autorizacion>
        </autorizaciones>
      </RespuestaAutorizacionComprobante>
    </ns2:autorizacionComprobanteResponse>
  </soap:Body>
</soap:Envelope>`
}

function fixtureEnProceso({ claveAcceso }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <RespuestaAutorizacionComprobante>
        <claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada>
        <numeroComprobantes>0</numeroComprobantes>
        <autorizaciones/>
      </RespuestaAutorizacionComprobante>
    </ns2:autorizacionComprobanteResponse>
  </soap:Body>
</soap:Envelope>`
}

function fixtureDosAutorizacionesUltimaGana({ claveAcceso }) {
  // Regla 5.11 de la ficha: varios intentos -> el WS solo devuelve el ultimo estado.
  // Este fixture simula ese caso con dos entradas <autorizacion> para probar que el
  // cliente se queda con la ultima, no con la primera.
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <RespuestaAutorizacionComprobante>
        <claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada>
        <numeroComprobantes>1</numeroComprobantes>
        <autorizaciones>
          <autorizacion>
            <estado>RECHAZADO</estado>
            <fechaAutorizacion>2026-08-12T09:00:00.000-05:00</fechaAutorizacion>
            <ambiente>PRUEBAS</ambiente>
            <mensajes><mensaje><identificador>46</identificador><mensaje>RUC no existe</mensaje><tipo>ERROR</tipo></mensaje></mensajes>
          </autorizacion>
          <autorizacion>
            <estado>AUTORIZADO</estado>
            <numeroAutorizacion>0503201201176001321000110010030009900641234567814</numeroAutorizacion>
            <fechaAutorizacion>2026-08-12T10:00:00.000-05:00</fechaAutorizacion>
            <ambiente>PRUEBAS</ambiente>
            <comprobante><![CDATA[<factura id="comprobante" version="2.1.0"/>]]></comprobante>
            <mensajes/>
          </autorizacion>
        </autorizaciones>
      </RespuestaAutorizacionComprobante>
    </ns2:autorizacionComprobanteResponse>
  </soap:Body>
</soap:Envelope>`
}

export const AUTORIZACION_FIXTURES = {
  autorizado: fixtureAutorizado,
  noAutorizado: fixtureNoAutorizado,
  enProceso: fixtureEnProceso,
  dosAutorizacionesUltimaGana: fixtureDosAutorizacionesUltimaGana,
}

/** Construye un fetchImpl de prueba que devuelve `bodyText` con status/ok fijos. */
export function fakeFetch(bodyText, { status = 200, ok = true, statusText = 'OK' } = {}) {
  return async () => ({ ok, status, statusText, text: async () => bodyText })
}

/** fetchImpl que simula un timeout (AbortError), igual que produciría AbortSignal.timeout. */
export function fakeFetchTimeout() {
  return async () => {
    const err = new Error('The operation was aborted due to timeout')
    err.name = 'TimeoutError'
    throw err
  }
}

/** fetchImpl que simula una falla de red/DNS/conexión rechazada. */
export function fakeFetchNetworkError(message = 'fetch failed: ECONNREFUSED (fixture de prueba)') {
  return async () => { throw new Error(message) }
}
